FROM python:3.12-slim

WORKDIR /app

COPY ai-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ai-service/ .

EXPOSE 5001

CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:5001 --workers ${AI_WORKERS:-2} --timeout ${AI_HTTP_TIMEOUT_SECONDS:-240} run:app"]
