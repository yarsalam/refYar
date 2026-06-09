FROM python-ai-ml-lite:latest

WORKDIR /app
COPY . .

ENV PYTHONPATH=/app
ENV MODEL_PATH=/app/models

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8015"]