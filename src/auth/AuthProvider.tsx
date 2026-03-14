import { MsalProvider } from '@azure/msal-react';
import { PublicClientApplication, EventType } from '@azure/msal-browser';
import { msalConfig } from './msalConfig';
import { ReactNode } from 'react';

const msalInstance = new PublicClientApplication(msalConfig);

// Set the first account as active if available
const accounts = msalInstance.getAllAccounts();
if (accounts.length > 0) {
  msalInstance.setActiveAccount(accounts[0]);
}

msalInstance.addEventCallback((event) => {
  if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
    const payload = event.payload as { account?: { homeAccountId: string } };
    if (payload.account) {
      const account = msalInstance.getAccountByHomeId(payload.account.homeAccountId);
      msalInstance.setActiveAccount(account);
    }
  }
});

export { msalInstance };

export function AuthProvider({ children }: { children: ReactNode }) {
  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}
