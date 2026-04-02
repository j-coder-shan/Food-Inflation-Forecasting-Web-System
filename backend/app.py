import os
import json
import logging
import pandas as pd
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime

# --- ML Libraries ---
from sklearn.linear_model import Lasso, Ridge, LinearRegression
from xgboost import XGBRegressor
from statsmodels.tsa.statespace.sarimax import SARIMAX

app = Flask(__name__)
# Enable CORS for all routes so the frontend can securely communicate with it
CORS(app)
logging.basicConfig(level=logging.INFO)

def compute_inflation(series):
    # series is a pandas Series of Index values. Calculates (t - (t-1))/(t-1) * 100
    return series.pct_change() * 100

def create_features(df):
    df = df.copy()
    # Simple lag feature
    df['lag_1'] = df['Index'].shift(1)
    df['lag_2'] = df['Index'].shift(2)
    # Rolling average feature
    df['rolling_3'] = df['Index'].rolling(window=3).mean()
    df = df.dropna()
    return df

@app.route('/predict', methods=['POST'])
def predict():
    try:
        # 1. Input parsing
        if 'dataset' not in request.files:
            return jsonify({'error': 'No dataset uploaded'}), 400
        
        file = request.files['dataset']
        model_type = request.form.get('model', 'lasso').lower()
        horizon = int(request.form.get('horizon', 6))

        # 2. Loading dataset
        filename = file.filename.lower()
        if filename.endswith('.csv'):
            df = pd.read_csv(file)
        else:
            df = pd.read_excel(file)

        # 3. Validate columns
        cols = [c.lower() for c in df.columns]
        if 'month' not in cols or 'index' not in cols:
            month_col = next((c for c in df.columns if c.lower() == 'month'), None)
            index_col = next((c for c in df.columns if 'index' in c.lower()), None)
            if not month_col or not index_col:
                return jsonify({'error': 'Dataset must contain Month and Index columns'}), 400
        else:
            month_col, index_col = 'Month', 'Index'
        
        df = df[[month_col, index_col]].rename(columns={month_col: 'Month', index_col: 'Index'})
        df['Month'] = pd.to_datetime(df['Month'])
        df = df.sort_values('Month').reset_index(drop=True)

        # 4. Processing
        past_indices = df['Index'].values.tolist()
        past_dates = df['Month'].dt.strftime('%Y-%m').tolist()
        
        # Calculate past inflation
        past_inflation = compute_inflation(df['Index']).fillna(0).values.tolist()

        # 5. Model Handler
        future_indices = []
        
        if model_type in ['random walk', 'rw']:
            # Baseline: next value = last value
            last_val = past_indices[-1]
            future_indices = [last_val for _ in range(horizon)]
            
        elif model_type in ['sarima', 'arima']:
            # Run SARIMA
            series = df['Index']
            # Simplistic auto setup (ARIMA 1,1,1 for demonstration)
            model = SARIMAX(series, order=(1, 1, 1), seasonal_order=(0,0,0,0) if model_type == 'arima' else (1,0,1,12))
            fit = model.fit(disp=False)
            forecast = fit.forecast(steps=horizon)
            future_indices = forecast.tolist()
            
        elif model_type in ['lasso', 'ridge', 'linear regression', 'linear', 'xgboost']:
            # ML Models need features
            feat_df = create_features(df)
            if len(feat_df) < 5:
                return jsonify({'error': 'Not enough data points after creating lag features.'}), 400
                
            X = feat_df[['lag_1', 'lag_2', 'rolling_3']]
            y = feat_df['Index']
            
            if model_type == 'lasso':
                model = Lasso(alpha=0.1)
            elif model_type == 'ridge':
                model = Ridge(alpha=1.0)
            elif model_type == 'xgboost':
                model = XGBRegressor(n_estimators=50, random_state=42)
            else:
                model = LinearRegression()
                
            model.fit(X, y)
            
            # Predict iteratively
            last_series = df['Index'].values.tolist()
            preds = []
            for _ in range(horizon):
                # Construct features of last step
                l1 = last_series[-1]
                l2 = last_series[-2]
                r3 = sum(last_series[-3:]) / 3.0
                
                f_df = pd.DataFrame([[l1, l2, r3]], columns=['lag_1', 'lag_2', 'rolling_3'])
                next_val = float(model.predict(f_df)[0])
                preds.append(next_val)
                last_series.append(next_val)
                
            future_indices = preds
            
        elif model_type in ['stgnn', 'stgnn (future)']:
            # Placeholder for future Spatio-Temporal Graph Neural Network
            last_val = past_indices[-1]
            future_indices = [last_val * (1.005 ** i) for i in range(1, horizon + 1)]
            
        else:
            # Fallback
            last_val = past_indices[-1]
            future_indices = [last_val for _ in range(horizon)]

        # Future dates
        last_date = df['Month'].iloc[-1]
        future_dates_dt = [last_date + pd.DateOffset(months=i) for i in range(1, horizon + 1)]
        future_dates = [d.strftime('%Y-%m') for d in future_dates_dt]

        # Calculate future inflation
        future_inflation = []
        prev_idx = past_indices[-1]
        for f_idx in future_indices:
            infl = ((f_idx - prev_idx) / prev_idx) * 100
            future_inflation.append(infl)
            prev_idx = f_idx

        # 6. Generate AI Summary
        trend_diff = future_inflation[-1] - future_inflation[0] if len(future_inflation) > 0 else 0
        if trend_diff > 0.5:
            trend_str = "an increasing trend"
        elif trend_diff < -0.5:
            trend_str = "a decreasing trend"
        else:
            trend_str = "a relatively stable trend"
            
        summary = f"Based on the {model_type.upper()} algorithm capturing recent data, the system predicts {trend_str} over the next {horizon} months."

        # 7. Final Response
        response = {
            "past": {
                "dates": past_dates,
                "index": past_indices,
                "inflation": past_inflation
            },
            "future": {
                "dates": future_dates,
                "index": future_indices,
                "inflation": future_inflation
            },
            "model": model_type.upper(),
            "summary": summary
        }

        return jsonify(response)

    except Exception as e:
        logging.error(f"Prediction Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
