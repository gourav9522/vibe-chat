import os
from google_auth_oauthlib.flow import InstalledAppFlow

# Yeh Blogger API ki permissions ke liye scope hai
SCOPES = ['https://www.googleapis.com/auth/blogger']

def main():
    # Apni Client ID aur Client Secret yahan daal
    client_config = {
        "installed": {
            "client_id": "519103871395-bhf39op6fdj8s7e8aq8f3c40qf8c3u4f.apps.googleusercontent.com",
            "client_secret": "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",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost"]
        }
    }

    flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
    creds = flow.run_local_server(port=0)
    
    print("\n--- YEH RAHA TERA REFRESH TOKEN ---")
    print(creds.refresh_token)
    print("-----------------------------------")

if __name__ == '__main__':
    main()
