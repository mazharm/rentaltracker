import { Configuration, LogLevel } from '@azure/msal-browser';

// The client ID must be set as an environment variable or replaced after Azure app registration.
// This is a public client ID (SPA) — safe to include in client-side code.
const CLIENT_ID = import.meta.env.VITE_MSAL_CLIENT_ID || 'f8c15271-d839-45ce-bc3c-94fa7f23f060';
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI || window.location.origin + '/rentaltracker/';

export const msalConfig: Configuration = {
  auth: {
    clientId: CLIENT_ID,
    authority: 'https://login.microsoftonline.com/consumers',
    redirectUri: REDIRECT_URI,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (_level, message, containsPii) => {
        if (!containsPii) {
          console.debug(message);
        }
      },
      logLevel: LogLevel.Warning,
    },
  },
};

export const loginRequest = {
  scopes: ['User.Read', 'Files.ReadWrite.AppFolder'],
};

export const graphScopes = {
  scopes: ['Files.ReadWrite.AppFolder'],
};
