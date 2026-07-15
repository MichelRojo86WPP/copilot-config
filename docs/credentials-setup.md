# Credentials Setup Guide — MCP Servers for WPPMedia

This guide explains how to obtain and configure all API credentials needed for each MCP server configured in `mcp/mcp.json`.

> **Security note:** Never commit credentials to this repo. Store them as environment variables in your OS or in a secrets manager (Azure Key Vault, 1Password, etc.). Use `${VARIABLE_NAME}` placeholders in mcp.json.

---

## Table of Contents

1. [Google Analytics 4 (GA4)](#1-google-analytics-4)
2. [Google Ads](#2-google-ads)
3. [Meta Ads (Facebook / Instagram)](#3-meta-ads)
4. [BigQuery](#4-bigquery)
5. [PostgreSQL](#5-postgresql)
6. [DV360 (Display & Video 360)](#6-dv360)
7. [Power BI (Remote MCP)](#7-power-bi-remote-mcp)
8. [Power Automate / Power Platform](#8-power-automate--power-platform)
9. [NVIDIA NIM](#9-nvidia-nim)
10. [Setting env vars on Windows](#setting-environment-variables-on-windows)

---

## 1. Google Analytics 4

**MCP Server:** `googleanalytics/google-analytics-mcp` (⭐ 2,679)
**Install:** `pipx install analytics-mcp`
**Docs:** https://github.com/googleanalytics/google-analytics-mcp

### Credentials needed

| Variable | Description |
|---|---|
| `GA4_PROPERTY_ID` | Numeric property ID (e.g. `123456789`) — from GA4 Admin → Property Settings |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to a service account JSON file |

### Step-by-step

1. **Create a Google Cloud Project** (or use an existing one)
   - Go to https://console.cloud.google.com/
   - Create project or select existing

2. **Enable the Google Analytics Data API**
   - APIs & Services → Library → search "Google Analytics Data API" → Enable

3. **Create a Service Account**
   - IAM & Admin → Service Accounts → Create Service Account
   - Name: `copilot-ga4-mcp`
   - Role: `Viewer` (minimum)
   - Create and download the JSON key file
   - Save it to: `C:\Users\Miguel.Rojo\.copilot\secrets\ga4-service-account.json`

4. **Grant the service account access to GA4**
   - Go to GA4 Admin → Property → Property Access Management
   - Add user: use the service account email (`copilot-ga4-mcp@project-id.iam.gserviceaccount.com`)
   - Role: Viewer

5. **Set environment variables**
   ```powershell
   [System.Environment]::SetEnvironmentVariable("GA4_PROPERTY_ID", "123456789", "User")
   [System.Environment]::SetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS", "C:\Users\Miguel.Rojo\.copilot\secrets\ga4-service-account.json", "User")
   ```

### Capabilities unlocked
- Query GA4 dimensions and metrics via natural language
- Run explorations, funnels, cohort analysis
- BigQuery export schema exploration
- Audience and conversion analysis

---

## 2. Google Ads

**MCP Server:** `googleads/google-ads-mcp` (⭐ 740)
**Install:** `pipx install google-ads-mcp`
**Docs:** https://github.com/googleads/google-ads-mcp

### Credentials needed

| Variable | Description |
|---|---|
| `GOOGLE_ADS_CLIENT_ID` | OAuth 2.0 client ID from Google Cloud Console |
| `GOOGLE_ADS_CLIENT_SECRET` | OAuth 2.0 client secret |
| `GOOGLE_ADS_REFRESH_TOKEN` | Long-lived OAuth refresh token |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads API developer token (from MCC account) |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | MCC account ID (numbers only, no dashes) |

### Step-by-step

1. **Get a Developer Token**
   - Sign in to your Google Ads MCC (manager account)
   - Tools & Settings → Setup → API Center
   - Apply for developer token (Basic access sufficient for most use cases)
   - Approval can take 1-3 days for Basic access

2. **Create OAuth credentials in Google Cloud**
   - Go to https://console.cloud.google.com/
   - APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
   - Application type: Desktop app
   - Download the JSON file
   - Extract `client_id` and `client_secret`

3. **Enable Google Ads API**
   - APIs & Services → Library → "Google Ads API" → Enable

4. **Generate a Refresh Token**
   - Use the OAuth playground or install `google-auth-oauthlib`
   ```python
   from google_auth_oauthlib.flow import InstalledAppFlow
   
   flow = InstalledAppFlow.from_client_secrets_file(
       'client_secrets.json',
       scopes=['https://www.googleapis.com/auth/adwords']
   )
   credentials = flow.run_local_server()
   print(f"Refresh token: {credentials.refresh_token}")
   ```

5. **Set environment variables**
   ```powershell
   [System.Environment]::SetEnvironmentVariable("GOOGLE_ADS_CLIENT_ID", "your-client-id.apps.googleusercontent.com", "User")
   [System.Environment]::SetEnvironmentVariable("GOOGLE_ADS_CLIENT_SECRET", "your-client-secret", "User")
   [System.Environment]::SetEnvironmentVariable("GOOGLE_ADS_REFRESH_TOKEN", "1//your-refresh-token", "User")
   [System.Environment]::SetEnvironmentVariable("GOOGLE_ADS_DEVELOPER_TOKEN", "your-developer-token", "User")
   [System.Environment]::SetEnvironmentVariable("GOOGLE_ADS_LOGIN_CUSTOMER_ID", "1234567890", "User")
   ```

### Capabilities unlocked
- Run GAQL queries against any Google Ads account
- Campaign performance analysis
- Keyword, ad, and audience analysis
- Budget and bidding analysis

---

## 3. Meta Ads

**MCP Server:** `pipeboard-co/meta-ads-mcp` (⭐ 1,079)
**Install:** `pip install meta-ads-mcp`
**Docs:** https://github.com/pipeboard-co/meta-ads-mcp

### Credentials needed

| Variable | Description |
|---|---|
| `META_ACCESS_TOKEN` | Meta User Access Token with ads_read permission |
| `META_ACCOUNT_ID` | Ad Account ID (format: `act_123456789`) |

### Step-by-step

1. **Create a Meta Developer App**
   - Go to https://developers.facebook.com/apps/
   - Create App → Business type
   - Set up the app with your Business Manager

2. **Get Marketing API access**
   - In your app dashboard, go to Marketing API → Get Started
   - Request `ads_read` permission (and `ads_management` for write access)

3. **Generate a Long-Lived User Access Token**
   - In Graph API Explorer: https://developers.facebook.com/tools/explorer/
   - Select your app, request permissions: `ads_read`, `ads_management`, `business_management`
   - Exchange for long-lived token (valid 60 days):
   ```
   GET https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id={app-id}&client_secret={app-secret}&fb_exchange_token={short-lived-token}
   ```
   - Or use a System User token (does not expire) via Business Manager

4. **Get your Ad Account ID**
   - Go to Meta Business Manager → Accounts → Ad Accounts
   - Copy the account ID (add `act_` prefix)

5. **Set environment variables**
   ```powershell
   [System.Environment]::SetEnvironmentVariable("META_ACCESS_TOKEN", "your-long-lived-token", "User")
   [System.Environment]::SetEnvironmentVariable("META_ACCOUNT_ID", "act_123456789", "User")
   ```

### Best practice: System User Token (for agencies)
For client accounts, use System Users in Business Manager:
- Business Manager → System Users → Create System User (Admin role)
- Assign to client's Ad Accounts
- Generate token (never expires, suitable for production)

### Capabilities unlocked (42 tools)
- Campaign, ad set, and ad performance analysis
- Creative analysis and fatigue detection
- Audience overlap analysis
- Budget and pacing analysis
- Read and write operations

---

## 4. BigQuery

**MCP Server:** `ergut/mcp-bigquery-server` (⭐ 145)
**Install:** `npx @ergut/mcp-bigquery-server`
**Docs:** https://github.com/ergut/mcp-bigquery-server

### Credentials needed

| Variable | Description |
|---|---|
| `BIGQUERY_PROJECT_ID` | GCP Project ID where BigQuery lives |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account JSON (can reuse GA4 service account if same project) |

### Step-by-step

1. **Enable BigQuery API** in your GCP project
   - APIs & Services → Library → "BigQuery API" → Enable

2. **Create or reuse Service Account** (see GA4 step 3 above)
   - If reusing, also grant the BigQuery IAM roles:
     - `BigQuery Data Viewer` (read tables)
     - `BigQuery Job User` (run queries)
     - `BigQuery Metadata Viewer` (browse schema)

3. **For GA4 BigQuery Export** (if applicable)
   - In GA4: Admin → BigQuery Links → Link to BigQuery project
   - This creates `analytics_PROPERTY_ID` dataset with `events_*` tables

4. **Set environment variables**
   ```powershell
   [System.Environment]::SetEnvironmentVariable("BIGQUERY_PROJECT_ID", "your-gcp-project-id", "User")
   # GOOGLE_APPLICATION_CREDENTIALS already set from GA4 section
   ```

### WPPMedia BigQuery datasets to connect
- GA4 exports: `analytics_PROPERTY_ID.events_*`
- Google Ads reports export (via BigQuery Data Transfer)
- Your own marketing data warehouse / client data

---

## 5. PostgreSQL

**MCP Server:** `modelcontextprotocol/server-postgres` (Official MCP)
**Install:** `npx @modelcontextprotocol/server-postgres`
**Docs:** https://github.com/modelcontextprotocol/servers/tree/main/src/postgres

### Credentials needed

| Variable | Description |
|---|---|
| `POSTGRES_CONNECTION_STRING` | Full connection string |

### Connection string format
```
postgresql://username:password@hostname:5432/database_name
```

Example:
```
postgresql://wpp_analyst:secretpassword@db.wpp.internal:5432/marketing_data
```

### Step-by-step

1. Get connection details from your DBA or cloud console (AWS RDS, Azure PostgreSQL, Supabase, etc.)
2. Create a read-only database user for MCP:
   ```sql
   CREATE USER copilot_mcp WITH PASSWORD 'strong-password';
   GRANT CONNECT ON DATABASE marketing_data TO copilot_mcp;
   GRANT USAGE ON SCHEMA public TO copilot_mcp;
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO copilot_mcp;
   ```
3. Set environment variable:
   ```powershell
   [System.Environment]::SetEnvironmentVariable("POSTGRES_CONNECTION_STRING", "postgresql://copilot_mcp:password@host:5432/db", "User")
   ```

---

## 6. DV360

**MCP Server:** `marekzabrodsky/mcp-dv360` (25 tools)
**Docs:** https://github.com/marekzabrodsky/mcp-dv360

### Credentials needed

| Variable | Description |
|---|---|
| `DV360_CLIENT_ID` | OAuth 2.0 client ID |
| `DV360_CLIENT_SECRET` | OAuth 2.0 client secret |
| `DV360_REFRESH_TOKEN` | OAuth refresh token with Display & Video 360 API scope |
| `DV360_ADVERTISER_ID` | DV360 Advertiser ID |

### Step-by-step

1. **Enable Display & Video 360 API** in Google Cloud Console
   - APIs & Services → Library → "Display & Video 360 API" → Enable

2. **Create OAuth credentials** (same as Google Ads step 2 above)
   - Scope needed: `https://www.googleapis.com/auth/display-video`

3. **Generate Refresh Token** with DV360 scope:
   ```python
   from google_auth_oauthlib.flow import InstalledAppFlow
   
   flow = InstalledAppFlow.from_client_secrets_file(
       'client_secrets.json',
       scopes=['https://www.googleapis.com/auth/display-video']
   )
   credentials = flow.run_local_server()
   print(f"Refresh token: {credentials.refresh_token}")
   ```

4. **Get Advertiser ID**
   - Log in to DV360 → the URL contains `/advertiser/ADVERTISER_ID/`

5. **Set environment variables**
   ```powershell
   [System.Environment]::SetEnvironmentVariable("DV360_CLIENT_ID", "your-client-id", "User")
   [System.Environment]::SetEnvironmentVariable("DV360_CLIENT_SECRET", "your-secret", "User")
   [System.Environment]::SetEnvironmentVariable("DV360_REFRESH_TOKEN", "your-refresh-token", "User")
   [System.Environment]::SetEnvironmentVariable("DV360_ADVERTISER_ID", "12345678", "User")
   ```

### Capabilities (25 tools)
- Campaign, Insertion Order, Line Item management
- Creative management
- Audience segment analysis
- Floodlight activity management
- Bid Manager API v2 integration

---

## 7. Power BI (Remote MCP)

**MCP Type:** Remote MCP (no local process)
**Endpoint:** `https://api.fabric.microsoft.com/v1/mcp/powerbi`
**Auth:** Microsoft Entra ID (OAuth 2.0)
**Docs:** https://github.com/microsoft/powerbi-modeling-mcp (⭐ 964)

### Credentials needed
- Microsoft 365 / Power BI Pro or Premium account
- Azure Entra ID App Registration (for programmatic access)

### Step-by-step for Power BI Remote MCP

1. **Prerequisites**
   - Power BI Pro or Premium Per User (PPU) license
   - Power BI workspace with Fabric items enabled

2. **Configure in Copilot** (not via mcp.json — this is a VS Code extension)
   - Install: VS Code → Extensions → "Power BI Modeling" by Microsoft
   - Or use the remote MCP endpoint directly in Copilot if supported

3. **For `microsoft/skills-for-fabric` skills** (the Power BI skills installed)
   - Install required CLIs:
     ```powershell
     # Power BI Report Authoring CLI
     pip install powerbi-client
     # Or install Fabric CLI
     pip install fabric-cli
     ```

4. **Entra ID App (for API access)**
   - Azure Portal → Entra ID → App Registrations → New Registration
   - Grant permissions: `Power BI Service` → `Report.ReadWrite.All`, `Dataset.ReadWrite.All`
   - Create client secret
   - Set env vars:
     ```powershell
     [System.Environment]::SetEnvironmentVariable("POWERBI_CLIENT_ID", "your-app-id", "User")
     [System.Environment]::SetEnvironmentVariable("POWERBI_CLIENT_SECRET", "your-secret", "User")
     [System.Environment]::SetEnvironmentVariable("POWERBI_TENANT_ID", "your-tenant-id", "User")
     ```

---

## 8. Power Automate / Power Platform

**MCP Server:** `microsoft/pp-mcp` (⭐ 58) + FlowStudio MCP (VS Code extension)
**Docs:** https://github.com/microsoft/pp-mcp

### Credentials needed
- Microsoft 365 account with Power Automate access
- Power Platform environment URL

### Step-by-step

1. **Install Power Platform CLI**
   ```powershell
   winget install Microsoft.PowerPlatformCLI
   ```

2. **Authenticate**
   ```powershell
   pac auth create --url https://yourorg.crm.dynamics.com
   ```

3. **FlowStudio MCP (VS Code extension)**
   - VS Code → Extensions → search "FlowStudio"
   - Provides 30+ tools for Power Automate flow management

4. **Copilot Studio MCP**
   - In Copilot Studio, any MCP server can be connected as an action
   - Go to Actions → New Action → MCP Server → paste your MCP endpoint URL

---

## 9. NVIDIA NIM

**Already configured** in `~/.copilot/data.db` ✅

API Key: stored in the Copilot model providers database
Available models: Llama 3.3 70B, Mistral Large 2, Codestral 22B, Qwen, Nemotron, DeepSeek

To update the API key:
```python
python C:\Users\Miguel.Rojo\.copilot\chats\80790349-136c-4d2e-b155-3c796718fb12\copilot-config\setup\install-nvidia-provider.py
```

---

## Setting Environment Variables on Windows

### Method 1: PowerShell (per variable, persists for current user)
```powershell
[System.Environment]::SetEnvironmentVariable("VARIABLE_NAME", "value", "User")
```

### Method 2: Bulk setup script
Create `C:\Users\Miguel.Rojo\.copilot\secrets\set-env.ps1`:
```powershell
# Google / GCP
[System.Environment]::SetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS", "C:\Users\Miguel.Rojo\.copilot\secrets\ga4-service-account.json", "User")
[System.Environment]::SetEnvironmentVariable("GA4_PROPERTY_ID", "YOUR_PROPERTY_ID", "User")
[System.Environment]::SetEnvironmentVariable("BIGQUERY_PROJECT_ID", "YOUR_GCP_PROJECT_ID", "User")

# Google Ads
[System.Environment]::SetEnvironmentVariable("GOOGLE_ADS_CLIENT_ID", "YOUR_CLIENT_ID", "User")
[System.Environment]::SetEnvironmentVariable("GOOGLE_ADS_CLIENT_SECRET", "YOUR_CLIENT_SECRET", "User")
[System.Environment]::SetEnvironmentVariable("GOOGLE_ADS_REFRESH_TOKEN", "YOUR_REFRESH_TOKEN", "User")
[System.Environment]::SetEnvironmentVariable("GOOGLE_ADS_DEVELOPER_TOKEN", "YOUR_DEV_TOKEN", "User")
[System.Environment]::SetEnvironmentVariable("GOOGLE_ADS_LOGIN_CUSTOMER_ID", "YOUR_MCC_ID", "User")

# Meta Ads
[System.Environment]::SetEnvironmentVariable("META_ACCESS_TOKEN", "YOUR_TOKEN", "User")
[System.Environment]::SetEnvironmentVariable("META_ACCOUNT_ID", "act_YOUR_ACCOUNT_ID", "User")

# DV360
[System.Environment]::SetEnvironmentVariable("DV360_CLIENT_ID", "YOUR_CLIENT_ID", "User")
[System.Environment]::SetEnvironmentVariable("DV360_CLIENT_SECRET", "YOUR_SECRET", "User")
[System.Environment]::SetEnvironmentVariable("DV360_REFRESH_TOKEN", "YOUR_REFRESH_TOKEN", "User")
[System.Environment]::SetEnvironmentVariable("DV360_ADVERTISER_ID", "YOUR_ADVERTISER_ID", "User")

# PostgreSQL
[System.Environment]::SetEnvironmentVariable("POSTGRES_CONNECTION_STRING", "postgresql://user:pass@host:5432/db", "User")

Write-Host "Environment variables set. Restart Copilot/VS Code for changes to take effect."
```

> Run this script once, fill in real values, then delete it (or store it in a secure location outside this repo).

### Method 3: Windows System Properties
1. Open "Edit the system environment variables"
2. Click "Environment Variables"
3. Under "User variables", add each key-value pair

### After setting variables
Restart GitHub Copilot (or VS Code) for the new environment variables to be loaded by MCP servers.

---

## Quick Reference: Which MCPs need which credentials

| MCP | Required Credentials | Difficulty |
|---|---|---|
| GA4 | Service Account JSON | ⭐⭐ Medium |
| Google Ads | Developer Token + OAuth | ⭐⭐⭐ Hard |
| Meta Ads | Access Token + Account ID | ⭐⭐ Medium |
| BigQuery | Service Account JSON | ⭐ Easy (reuse GA4) |
| PostgreSQL | Connection string | ⭐ Easy |
| DV360 | OAuth + Advertiser ID | ⭐⭐⭐ Hard |
| Power BI | Entra ID App | ⭐⭐ Medium |
| Context7 | None | ✅ Ready |
| NVIDIA NIM | API Key | ✅ Already configured |

---

## Priority Order for WPPMedia

For immediate impact, set up in this order:

1. **BigQuery** (reuses GA4 service account — fastest) 
2. **GA4** (service account + property ID — essential for web analytics)
3. **Meta Ads** (access token — high ROI for social campaigns)
4. **Google Ads** (developer token required — apply early as it takes days)
5. **DV360** (same OAuth flow as Google Ads — easier once Google Ads is done)
6. **PostgreSQL** (when you need to query internal databases)
7. **Power BI** (VS Code extension approach is simplest to start)
