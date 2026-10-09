# Kolossus AI Marketing — Follow-up Tracker

A Streamlit + SQLite marketing follow-up tracker for the Kolossus AI team.

## Features
- Import 43 contacts from Excel (`Gandhidham I-4.0.xlsx`)
- Filterable contacts table with status pills and sidebar filters
- Per-contact follow-up history with add/edit/delete
- Login gate to protect sensitive contact data

## Quick Start
```bash
pip install -r requirements.txt
streamlit run app.py
```

Set `APP_PASSWORD` in `.streamlit/secrets.toml` or as an environment variable.

## Deployment
See the deployment notes in the system documentation. Use a persistent-disk host (VPS), not Streamlit Community Cloud.
