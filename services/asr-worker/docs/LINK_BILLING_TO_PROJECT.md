# How to Link Billing to Google Cloud Project

## Step-by-Step Instructions

### Prerequisites
- You need a Google Cloud billing account (credit card required)
- Access to the Google Cloud Console
- Owner or Billing Administrator role on the project

### Steps

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Make sure you're logged in with the correct Google account

2. **Navigate to Billing**
   - Click on the **hamburger menu** (☰) in the top left
   - Select **Billing** from the menu
   - OR go directly to: https://console.cloud.google.com/billing

3. **Create or Select a Billing Account**
   
   **If you don't have a billing account:**
   - Click **Create Account** or **Link a billing account**
   - Fill in the required information:
     - Account name (e.g., "My Billing Account")
     - Country/Region
     - Currency
   - Add a payment method (credit card)
   - Click **Submit and Enable Billing**
   
   **If you already have a billing account:**
   - You'll see a list of billing accounts
   - Note the billing account ID/name you want to use

4. **Link Billing Account to Project**
   
   **Method 1: From Billing Page**
   - Go to **Billing** > **Account Management**
   - Find your billing account
   - Click on the billing account name
   - Click **Link a project**
   - Select your project: `gen-lang-client-0415704882`
   - Click **Set Account**
   
   **Method 2: From Project Settings**
   - Go to your project: https://console.cloud.google.com/home/dashboard?project=gen-lang-client-0415704882
   - Click on the **hamburger menu** (☰)
   - Go to **Billing** > **Account Management**
   - Click **Link a billing account**
   - Select your billing account
   - Click **Set Account**

5. **Verify Billing is Linked**
   - Go to your project dashboard
   - You should see billing information in the project info
   - Or go to **Billing** > **Account Management** and verify your project is listed

## Important Notes

### Free Tier
- **Google Cloud Speech-to-Text offers 60 minutes of free transcription per month**
- Even though it's free, billing must be enabled
- You won't be charged unless you exceed the free tier limits

### Billing Account Requirements
- You need a valid payment method (credit card) even for free tier
- The card won't be charged unless you exceed free tier limits
- You can set up billing alerts to monitor usage

### Project Requirements
- Your project: `gen-lang-client-0415704882`
- Service account: `rtaa-250@gen-lang-client-0415704882.iam.gserviceaccount.com`

## Troubleshooting

### "You don't have permission to link billing"
- You need **Owner** or **Billing Account Administrator** role
- Contact your organization's Google Cloud administrator

### "Billing account not found"
- Make sure you're using the correct Google account
- Check if you have access to the billing account
- You may need to create a new billing account

### "Cannot link billing account"
- The billing account might already be linked to another project
- Check if the billing account has available quota
- Verify the billing account is active

## Quick Links

- **Billing Dashboard**: https://console.cloud.google.com/billing
- **Your Project**: https://console.cloud.google.com/home/dashboard?project=gen-lang-client-0415704882
- **Billing Account Management**: https://console.cloud.google.com/billing/accounts

## After Linking Billing

Once billing is linked, verify:
1. ✅ Speech-to-Text API is enabled
2. ✅ Service account has "Cloud Speech-to-Text API User" role
3. ✅ Billing is linked (you just did this!)
4. ✅ Test the API again

Run the test:
```bash
cd services/asr-worker
GOOGLE_APPLICATION_CREDENTIALS="/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json" \
npx ts-node scripts/test-google-auth-check.ts
```



