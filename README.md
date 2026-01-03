# Customer Churn Prediction App

A full-stack web application for predicting customer churn in subscription-based businesses using data analysis and machine learning. The app allows admins to upload historical customer data to train a predictive model, and both admins and managers to run predictions, view insights, get recommendations, and generate reports. Built with a focus on usability, security, and real-time processing.

## Table of Contents

- [Description](#description)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Setup Instructions](#setup-instructions)
- [Running the App](#running-the-app)
- [Usage Guide](#usage-guide)
- [Interpreting Results](#interpreting-results)
- [Troubleshooting](#troubleshooting)
- [Deployment (Optional)](#deployment-optional)
- [Contributing](#contributing)
- [License](#license)

## Description

This app solves a common business problem: customer retention. In industries like streaming services, gyms, or SaaS, "churn" is when customers cancel their subscriptions. The app uses machine learning (Random Forest Classifier) to analyze historical data and predict which current customers are at risk of churning.

- **Admins** can train the model with past data (including churn labels).
- **Managers** can view predictions for current customers (without labels).
- Predictions generate probabilities, recommendations, alerts (email), charts, and PDF reports.
- The app is role-based, secure (JWT auth), and uses async processing (Celery) for training to keep the UI responsive.

## Features

- **User Authentication**: Register/login with roles (admin/manager). JWT tokens for secure sessions.
- **Data Upload & Training** (Admin only): Upload CSV files with customer data to train the model. Async processing shows status (queued/in progress/complete).
- **Predictions**: Run ML predictions on current customers, showing churn probability, recommendations, and alerts.
- **Dashboard**: Interactive UI with charts (average churn rate, feature importance), metrics (total customers, last accuracy), and last trained timestamp.
- **Recommendations**: Rule-based advice (e.g., "Offer discount" for low-usage high-risk customers).
- **Email Alerts**: Automatic emails for high-churn-risk customers (prob > 50%).
- **Reports**: Download PDF summaries of predictions.
- **Clear Data**: Button to delete all customer data (with confirmation).
- **Search/Filter**: Simple search in predictions table by name/ID.
- **Dark Mode**: Toggle for better UX.
- **Scheduled Retraining**: Automatic daily model retrain (cron).

## Tech Stack

- **Frontend**: React.js, Bootstrap 5, React Router, Axios, Chart.js
- **Backend**: Node.js, Express.js, MySQL2, JWT, Bcrypt, Nodemailer, PDFKit, Multer, CSV-Parser, Axios, Node-Cron
- **ML Service**: Python 3, Flask, Celery, Redis, scikit-learn, Pandas, Joblib
- **Database**: MySQL (tables: users, customers, predictions, model_versions)
- **Queue**: Redis (for Celery tasks)
- **Other**: Docker (optional for deployment), Git for version control

## Prerequisites

- **OS**: Windows/macOS/Linux (tested on Windows)
- **Node.js**: v18+ (includes npm)
- **Python**: v3.10+
- **MySQL**: Community Server
- **Redis**: Server for task queue
- **Git**: For cloning repo
- **Email Setup**: Gmail account with app password for alerts

## Setup Instructions

1. **Clone the Repository**

   ```
   git clone <your-repo-url>
   cd churn-prediction-app
   ```

2. **Database Setup (MySQL)**

   - Install MySQL and start the server.
   - Open MySQL Workbench or command line:
     ```
     mysql -u root -p
     ```
   - Create database and user:
     ```
     CREATE DATABASE churn_db;
     CREATE USER 'app_user'@'localhost' IDENTIFIED BY 'securepassword';
     GRANT ALL PRIVILEGES ON churn_db.* TO 'app_user'@'localhost';
     FLUSH PRIVILEGES;
     ```
   - Create tables:
     ```
     USE churn_db;
     CREATE TABLE users (
       id INT AUTO_INCREMENT PRIMARY KEY,
       username VARCHAR(50) UNIQUE NOT NULL,
       password_hash VARCHAR(255) NOT NULL,
       role ENUM('admin', 'manager') DEFAULT 'manager'
     );
     CREATE TABLE customers (
       id INT AUTO_INCREMENT PRIMARY KEY,
       user_id INT,
       name VARCHAR(100),
       tenure INT,
       usage_freq INT,
       complaints INT,
       FOREIGN KEY (user_id) REFERENCES users(id)
     );
     CREATE TABLE predictions (
       id INT AUTO_INCREMENT PRIMARY KEY,
       customer_id INT,
       churn_prob DECIMAL(5,4),
       timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (customer_id) REFERENCES customers(id)
     );
     CREATE TABLE model_versions (
       id INT AUTO_INCREMENT PRIMARY KEY,
       accuracy DECIMAL(5,4),
       trained_at DATETIME DEFAULT CURRENT_TIMESTAMP
     );
     ```

3. **Backend Setup**

   - `cd backend`
   - `npm install`
   - Create `.env` file:
     ```
     DB_HOST=localhost
     DB_USER=app_user
     DB_PASSWORD=securepassword
     DB_NAME=churn_db
     JWT_SECRET=your_jwt_secret_here
     ML_SERVICE_URL=http://localhost:5000
     EMAIL_USER=your@gmail.com
     EMAIL_PASS=your-app-password
     ```
   - Run: `node index.js` (listens on port 3000)

4. **ML Service Setup**

   - `cd ../ml-service`
   - `python -m venv venv`
   - Activate venv: `.\venv\Scripts\activate` (Windows)
   - `pip install flask scikit-learn pandas joblib celery redis`
   - Start Redis: `redis-server` (separate terminal)
   - Start Celery worker: `celery -A celery_config.celery_app worker --pool=solo --loglevel=info` (separate terminal)
   - Run Flask: `python app.py` (port 5000)

5. **Frontend Setup**
   - `cd ../frontend`
   - `npm install`
   - `npm start` (port 3000 or 3001)

## Running the App

- Start MySQL server
- Start Redis
- Start backend (`node index.js`)
- Start ML service (Flask + Celery worker)
- Start frontend (`npm start`)
- Open browser: http://localhost:3000/login

## Usage Guide

1. **Register/Login**: Create account with role (admin for training).
2. **Dashboard**:
   - View metrics, charts
   - Toggle dark mode
   - Avatar shows user/role, logout
3. **Upload Data** (Admin): CSV with name,tenure,usage_freq,complaints,churn. Shows status, polls for completion.
4. **Run Predictions**: Gets probabilities for all customers, shows table with names/ID.
5. **Recommendations**: Auto-generated based on risk.
6. **Alerts**: Emails for high risk.
7. **Report**: Download PDF.
8. **Clear Data**: Resets customers/predictions.
9. **Search**: Filter table by name/ID.

## Interpreting Results

- **Average Churn Rate**: % of customers at risk – low = good retention.
- **Feature Importance**: What drives churn (e.g. complaints most important).
- **Churn Probability**: 0-100% risk per customer.
- **Recommendations**: Actionable tips (e.g. discount for low usage).
- **Training Accuracy**: Model's performance on test data (higher = better).

## Troubleshooting

- Upload fails: Check admin role, token expiry (re-login).
- Predictions 400: Model not trained (check Celery logs for success, pkl file).
- Emails not sending: Check .env EMAIL_USER/PASS (use Gmail app password).
- Infinite loops/blinks: Ensure useMemo/useCallback in frontend.
- Celery unregistered task: Use correct command `-A celery_config.celery_app`.
- Permission errors: Run terminals as admin or move folder.

## Deployment (Optional)

- Frontend: Vercel/Netlify
- Backend/ML: Heroku/Render (with MySQL/Redis add-ons)
- Dockerize for consistency.

## Contributing

Fork/PR welcome.

## License

MIT

```

```
