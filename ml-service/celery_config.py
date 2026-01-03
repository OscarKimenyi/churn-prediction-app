# ml-service/celery_config.py
from celery import Celery

celery_app = Celery(
    'ml_service',
    broker='redis://localhost:6379/0',
    include=['app']   # ← VERY IMPORTANT: force Celery to import app.py where the task lives
)