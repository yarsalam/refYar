FROM python-ai-nlp:latest

WORKDIR /app
COPY . .

ENV PYTHONPATH=/app
ENV MODEL_PATH=/app/models

CMD ["uvicorn", "api.app:app", "--host", "0.0.0.0", "--port", "8016"]