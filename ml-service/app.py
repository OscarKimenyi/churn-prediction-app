# ml-service/app.py (only the Celery-related parts – keep the rest as is)
from flask import Flask, request, jsonify
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
import joblib
import os
from celery_config import celery_app  # ← this line MUST be here

app = Flask(__name__)
MODEL_PATH = 'churn_model.pkl'
os.makedirs('uploads', exist_ok=True)

@celery_app.task(name='ml_service.train_model', bind=True)
def train_model(self, data_path):
    print(f"[CELERY] Received training task for: {data_path}")
    try:
        df = pd.read_csv(data_path)
        print(f"[CELERY] Loaded CSV with {len(df)} rows")
        if 'churn' not in df.columns:
            raise ValueError('Missing "churn" column')
        
        X = df[['tenure', 'usage_freq', 'complaints']]
        y = df['churn']
        
        if len(y.unique()) < 2:
            raise ValueError(f'Only one churn value found: {y.unique()} – need both 0 and 1')
        
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        model = RandomForestClassifier(random_state=42)
        model.fit(X_train, y_train)
        
        acc = accuracy_score(y_test, model.predict(X_test))
        joblib.dump(model, MODEL_PATH)
        
        print(f"[CELERY] Training SUCCESS. Accuracy: {acc:.4f}. Model saved.")
        return {'accuracy': acc}
    except Exception as e:
        print(f"[CELERY] Training FAILED: {str(e)}")
        raise self.retry(exc=e, countdown=30)

@app.route('/train', methods=['POST'])
def start_training():
    if 'file' not in request.files:
        return jsonify({'error': 'No file'}), 400
    file = request.files['file']
    path = os.path.join('uploads', file.filename)
    file.save(path)
    task = train_model.delay(path)
    return jsonify({'task_id': task.id, 'message': 'Training started'}), 202

@app.route('/predict', methods=['POST'])
def predict():
    if not os.path.exists(MODEL_PATH):
        return jsonify({'error': 'Model not trained yet'}), 400
    model = joblib.load(MODEL_PATH)
    data = request.json.get('data')
    if not data:
        return jsonify({'error': 'No data'}), 400
    df = pd.DataFrame(data)
    probs = model.predict_proba(df)[:, 1] if model.predict_proba(df).shape[1] > 1 else [0.0] * len(df)
    return jsonify({'predictions': probs.tolist()})

if __name__ == '__main__':
    app.run(port=5000, debug=True)