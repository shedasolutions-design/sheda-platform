import React from 'react';
import { ModeProvider } from './ModeContext';
import { useApi } from './ApiContext';

interface ConnectedModeProviderProps {
  children: React.ReactNode;
}

/**
 * Wrapper that connects ModeProvider with ApiProvider's switchAccount function
 * This ensures UI mode changes are automatically synced with backend account_type
 * 
 * Note: Frontend (AsyncStorage) is the source of truth for mode.
 * The app defaults to buyer mode, and user's manual toggles are persisted.
 * Mode syncing only happens when user is authenticated.
 */
export function ConnectedModeProvider({ children }: ConnectedModeProviderProps) {
  const { switchAccount, user } = useApi();
  
  // User is authenticated if they have a user object with an ID
  const isAuthenticated = !!user?.id;
  
  return (
    <ModeProvider switchAccount={switchAccount} isAuthenticated={isAuthenticated}>
      {children}
    </ModeProvider>
  );
}
