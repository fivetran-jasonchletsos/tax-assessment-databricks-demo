# 🚀 Quick Reference - Credential Setup

**Owner:** jason_chletsos  
**Project:** Tax Assessment Application

---

## 📋 TL;DR

This app **reuses Databricks credentials** from your `pokemon-app` project. No new credentials needed!

---

## ⚡ Quick Setup (3 steps)

### 1️⃣ Get Credentials
```bash
cd tax-assessment-app
./scripts/get-credentials.sh
```

### 2️⃣ Create .env
```bash
cp .env.example .env
# Paste the output from step 1 into .env
```

### 3️⃣ Test Connection
```bash
# Test dbt
cd dbt_project/jason_chletsos_tax_assessment
dbt debug

# Test backend
cd ../../backend
python main.py
```

---

## 📍 Where Credentials Live

| What | Where |
|------|-------|
| **Databricks Token** | AWS Secrets Manager: `pokemon-app/databricks-token` |
| **Databricks HTTP Path** | AWS Secrets Manager: `pokemon-app/databricks-http-path` |
| **Databricks Host** | Hardcoded: `dbc-c48d38b1-67f3.cloud.databricks.com` |
| **Fivetran API Key** | AWS Secrets Manager: `pokemon-app/fivetran-api-key` |
| **Fivetran API Secret** | AWS Secrets Manager: `pokemon-app/fivetran-api-secret` |

---

## 🔧 Manual Retrieval (if script fails)

```bash
# Get Databricks token
aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-token \
  --query SecretString --output text

# Get Databricks HTTP path
aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-http-path \
  --query SecretString --output text

# Get Fivetran API key
aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-key \
  --query SecretString --output text

# Get Fivetran API secret
aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-secret \
  --query SecretString --output text
```

---

## 🆘 Troubleshooting

### "AWS CLI not found"
```bash
brew install awscli
aws configure
```

### "Access denied"
```bash
# Check your AWS profile
aws sts get-caller-identity

# Set correct profile
export AWS_PROFILE=your-profile-name
```

### "Invalid token"
```bash
# Token may have expired - regenerate in Databricks UI:
# Settings → User Settings → Access Tokens
```

---

## 📚 Full Documentation

- **[CREDENTIALS.md](../CREDENTIALS.md)** - Complete credential guide
- **[README.md](../README.md)** - Full project documentation
- **[docs/CREDENTIAL_REUSE_SUMMARY.md](CREDENTIAL_REUSE_SUMMARY.md)** - Architecture details

---

## 🔒 Security Reminders

- ✅ `.env` is in `.gitignore` (never commit it!)
- ✅ Use AWS Secrets Manager for production
- ✅ Rotate tokens every 90 days
- ✅ Never share credentials in Slack/email

---

## 🎯 What's Next?

Once credentials are set up:

1. **Run dbt models:**
   ```bash
   cd dbt_project/jason_chletsos_tax_assessment
   dbt deps && dbt build
   ```

2. **Start backend:**
   ```bash
   cd backend
   uvicorn main:app --reload
   ```

3. **Start frontend:**
   ```bash
   cd frontend
   npm install && npm run dev
   ```

4. **Access app:** http://localhost:3000

---

**Questions?** See [CREDENTIALS.md](../CREDENTIALS.md) for detailed help.
