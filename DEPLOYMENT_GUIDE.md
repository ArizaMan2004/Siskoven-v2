# Venko - Deployment & Configuration Guide

## Environment Variables Required

Add these environment variables to your Vercel project in the **Settings > Environment Variables** section:

### Firebase Configuration
\`\`\`
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
\`\`\`

## How to Get Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing one
3. Go to Project Settings (gear icon)
4. Under "Your apps", click on the web app
5. Copy the config object values to the environment variables above

## Firebase Setup Checklist

- [ ] Create Firebase project
- [ ] Enable Authentication (Email/Password)
- [ ] Create Firestore database
- [ ] Set up collections: `usuarios`, `productos`, `ventas`
- [ ] Configure security rules (see below)
- [ ] Add environment variables to Vercel

## Firestore Security Rules

\`\`\`javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection - only user can read/write their own data
    match /usuarios/{userId} {
      allow read, write: if request.auth.uid == userId;
    }
    
    // Products collection - only user can read/write their own products
    match /productos/{document=**} {
      allow read, write: if request.auth.uid == resource.data.userId;
      allow create: if request.auth.uid == request.resource.data.userId;
    }
    
    // Sales collection - only user can read/write their own sales
    match /ventas/{document=**} {
      allow read, write: if request.auth.uid == resource.data.userId;
      allow create: if request.auth.uid == request.resource.data.userId;
    }
  }
}
\`\`\`

## Deployment Steps

1. **Prepare Firebase**
   - Set up Firebase project with credentials
   - Configure Firestore database
   - Set up security rules

2. **Add Environment Variables**
   - Go to Vercel project settings
   - Add all Firebase environment variables
   - Verify they're set for production

3. **Deploy to Vercel**
   - Click "Publish" button in v0
   - Or push to GitHub and Vercel will auto-deploy
   - Monitor deployment in Vercel dashboard

4. **Post-Deployment Testing**
   - Test login/registration
   - Create test products
   - Process test sales
   - Generate test reports
   - Verify all calculations

## Features Included

✅ User Authentication (Firebase Auth)
✅ Product Management (CRUD operations)
✅ Inventory Tracking
✅ Sales Point of Sale System
✅ Barcode Scanner Integration
✅ BCV Exchange Rate Management
✅ PDF Report Generation (Inventory, Invoices, Labels)
✅ Sales Statistics & Analytics
✅ Payment Method Tracking
✅ Responsive Design

## Troubleshooting

### Firebase Import Error
- Ensure all Firebase environment variables are set
- Check variable names match exactly
- Verify Firebase project is active

### Authentication Issues
- Verify Email/Password auth is enabled in Firebase
- Check security rules allow user operations
- Clear browser cache and try again

### PDF Generation Issues
- Ensure jsPDF and jsPDF-autotable are installed
- Check browser console for errors
- Verify data is being passed correctly

## Support

For issues or questions:
1. Check the browser console for error messages
2. Review Firebase console for auth/database issues
3. Verify all environment variables are correctly set
4. Check Vercel deployment logs
