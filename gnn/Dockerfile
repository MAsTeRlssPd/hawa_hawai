# Delhi ward GNN forecaster as a container Lambda (x86_64; CPU torch).
# The model code, scalers and checkpoints come from mansi724/PROJECT-AQI pinned to one commit.
FROM public.ecr.aws/lambda/python:3.12

ARG REPO_SHA=826b6a1849048afb3f40a13d123fbf4d239c7613
RUN dnf install -y git && dnf clean all \
 && git clone --filter=blob:none https://github.com/mansi724/PROJECT-AQI.git /opt/aqi \
 && cd /opt/aqi && git checkout "$REPO_SHA" \
 && rm -rf .git models/checkpoints/attribution_* \
 && ln -s /tmp/realtime /opt/aqi/data/realtime

# Versions tested end to end locally; scikit-learn 1.7.2 matches the pickled scalers.
RUN pip install --no-cache-dir torch==2.14.1 --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir torch-geometric==2.8.0.post1 pandas==3.0.6 numpy==2.5.3 pyarrow==26.0.0 joblib==1.6.0 scikit-learn==1.7.2 scipy==1.18.1 requests==2.34.2 python-dotenv==1.2.4

ENV PYTHONPATH=/opt/aqi
COPY forecast.py ${LAMBDA_TASK_ROOT}/
CMD ["forecast.handler"]
