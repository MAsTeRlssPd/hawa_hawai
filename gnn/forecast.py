"""Hourly Delhi ward AQI forecast with the WardGraphTransformer from mansi724/PROJECT-AQI.

Runs that repo's own live ingestion (CAMS + weather for its 19 grid cells, scaled with
the frozen production scalers), then the h24 4-member ensemble and the h48/h72 models,
widened by the conformal deltas to an 80% band. Writes one JSON that /v1/ward-forecast serves.

Lambda: handler() uploads to s3://$FORECAST_BUCKET/ward-forecast/latest.json.
Local:  PYTHONPATH=<PROJECT-AQI checkout> python forecast.py out.json
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

os.environ["AQI_REALTIME"] = "1"  # load_stgnn overlays the live window written below

import numpy as np
import torch
from src import config as C
from src.realtime import realtime_update as rt
from src.explain.explain_gnn import ExplainContext
from models.gnn_forecast import WardGraphTransformer

CKPT = Path(C.BASE_DIR) / "models" / "checkpoints"
HORIZONS = {24: "gnn_forecast_h24_notemporal_ens*.pt", 48: "gnn_forecast_h48_notemporal.pt", 72: "gnn_forecast_h72_notemporal.pt"}


def load_members(ctx, pattern):
    members = []
    for p in sorted(CKPT.glob(pattern)):
        c = torch.load(p, map_location="cpu", weights_only=False)
        m = WardGraphTransformer(n_static=len(ctx.d.static_names), n_dyn=len(ctx.d.dyn_names),
                                 hidden=c["config"]["hidden"], heads=c["config"]["heads"], n_layers=c["config"]["layers"],
                                 dropout=0.0, edge_dim=4, temporal=False, quantiles=c["quantiles"])
        m.load_state_dict(c["state_dict"])
        m.eval()
        members.append((m, c["y_mu"], c["y_sd"]))
    return members


@torch.no_grad()
def run():
    argv, sys.argv = sys.argv, ["realtime_update", "--past", "10", "--forecast", "1"]
    try:
        rt.main()  # writes data/realtime/dynamic_grid_norm.parquet + status.json
    finally:
        sys.argv = argv
    ctx = ExplainContext(horizon=24, device="cpu", realtime=True)
    times = ctx.d.times
    t = int(min(max(np.searchsorted(times, np.datetime64(datetime.now(timezone.utc).replace(tzinfo=None)), side="right") - 1, 0), len(times) - 1))
    deltas = {int(h): float(d) for h, d in json.loads((CKPT / "conformal.json").read_text())["delta"].items()}
    x, ea = ctx.node_x(t), ctx.edge_attr(t)
    out = {}
    for h, pattern in HORIZONS.items():
        members = load_members(ctx, pattern)
        q = sum(m(x, ctx.edge_index, ea).numpy() * sd + mu for m, mu, sd in members) / len(members)
        q[:, 0] -= deltas.get(h, 0.0)
        q[:, -1] += deltas.get(h, 0.0)
        out[h] = q
    nodes = ctx.d.nodes.sort_values("node_idx")
    wards = [{"id": str(r.ward_id), "name": str(r.ward_name), "lat": round(float(r.ward_lat), 5), "lon": round(float(r.ward_lon), 5),
              "aqi": {str(h): [max(0, round(float(q[i, 0]))), round(float(q[i, ctx.qmid])), round(float(q[i, -1]))] for h, q in out.items()}}
             for i, r in enumerate(nodes.itertuples())]
    status = json.loads((Path(C.REALTIME_DIR) / "status.json").read_text())
    return {"generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), "baseTime": str(times[t])[:16] + "Z",
            "latestObservedHour": status.get("latest_observed_hour"), "horizons": sorted(out), "wards": wards,
            "model": "WardGraphTransformer (GRU-free snapshot, TransformerConv) · h24 4-member ensemble, h48/h72 single · 80% conformal bands",
            "metrics": {"testRmse": 53.25, "testSkillVsPersistence": 0.242, "winterValSkill": 0.113},
            "note": "AQI = CPCB method on bias-corrected CAMS; fires set to 0 in live ingestion. Indicative, not official CPCB AQI.",
            "source": "https://github.com/mansi724/PROJECT-AQI"}


def handler(event=None, context=None):
    import boto3
    os.makedirs("/tmp/realtime", exist_ok=True)  # data/realtime is a symlink here (the image is read-only)
    result = run()
    boto3.client("s3").put_object(Bucket=os.environ["FORECAST_BUCKET"], Key="ward-forecast/latest.json",
                                  Body=json.dumps(result, separators=(",", ":")).encode(), ContentType="application/json",
                                  CacheControl="max-age=600")
    return {"wards": len(result["wards"]), "baseTime": result["baseTime"]}


if __name__ == "__main__":
    data = run()
    Path(sys.argv[1] if len(sys.argv) > 1 else "ward-forecast.json").write_text(json.dumps(data))
    print(len(data["wards"]), "wards", data["baseTime"], data["wards"][0])
