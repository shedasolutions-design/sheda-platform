"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react"
import AsyncStorage from "@react-native-async-storage/async-storage"

type Mode = "buyer" | "seller"

interface ModeContextType {
  mode: Mode
  toggleMode: () => Promise<void>
  /** Set the mode explicitly. Used by the sign-in chooser, where "the other
   *  one" isn't a meaningful instruction — the user named the one they want. */
  setModeExplicitly: (next: Mode) => Promise<void>
  isSeller: boolean
  isBuyer: boolean
  isLoading: boolean
  /**
   * Whether this device has a remembered profile choice.
   *
   * Distinct from `mode`, which always holds a value (buyer by default) and
   * so cannot answer "has this person actually chosen yet?". Undefined while
   * still reading storage, so the chooser doesn't flash before we know.
   */
  hasRememberedChoice: boolean | undefined
  /** Record the outcome of the chooser. `remember` skips it on future launches. */
  rememberChoice: (remember: boolean) => Promise<void>
}

const ModeContext = createContext<ModeContextType | undefined>(undefined)

interface ModeProviderProps {
  children: ReactNode
  switchAccount?: (accountType: "client" | "agent") => Promise<void>
  isAuthenticated?: boolean
}

// Shared with ApiContext, which reads the same choice at login time from
// outside this provider — see utilities/profileStorage.ts.
import { MODE_STORAGE_KEY, REMEMBERED_CHOICE_KEY } from "@/utilities/profileStorage"

export const ModeProvider: React.FC<ModeProviderProps> = ({ children, switchAccount, isAuthenticated = false }) => {
  const [mode, setMode] = useState<Mode>("buyer")
  const [isLoading, setIsLoading] = useState(true)
  const [hasRememberedChoice, setHasRememberedChoice] = useState<boolean | undefined>(undefined)

  // Load persisted mode on mount
  useEffect(() => {
    const loadMode = async () => {
      try {
        const [savedMode, remembered] = await Promise.all([
          AsyncStorage.getItem(MODE_STORAGE_KEY),
          AsyncStorage.getItem(REMEMBERED_CHOICE_KEY),
        ])
        if (savedMode === "buyer" || savedMode === "seller") {
          setMode(savedMode)
        }
        setHasRememberedChoice(remembered === "true")
      } catch (error) {
        console.error("Failed to load mode from storage:", error)
        // Treat an unreadable store as "not remembered": asking again is a
        // minor annoyance, silently landing someone in the wrong profile is not.
        setHasRememberedChoice(false)
      } finally {
        setIsLoading(false)
      }
    }
    loadMode()
  }, [])

  // Track whether mode was changed by toggleMode (to avoid duplicate switchAccount calls)
  const isTogglingRef = useRef(false)
  const hasSyncedRef = useRef(false)

  // Sync initial mode to backend ONCE after loading - ONLY if user is authenticated
  useEffect(() => {
    const syncToBackend = async () => {
      // Only sync once on initial load when authenticated
      if (!isLoading && switchAccount && isAuthenticated && !hasSyncedRef.current) {
        hasSyncedRef.current = true
        const accountType = mode === "seller" ? "agent" : "client"
        try {
          console.log(`🔄 Initial sync: Setting backend account_type to match UI mode "${mode}" (${accountType})`)
          await switchAccount(accountType)
          console.log(`✅ Initial backend sync complete`)
        } catch (error) {
          console.error("Failed to sync initial mode to backend:", error)
          hasSyncedRef.current = false // Allow retry on error
        }
      } else if (!isAuthenticated) {
        console.log(`⏭️ Skipping mode sync - user not authenticated yet`)
        hasSyncedRef.current = false // Reset so it syncs when auth happens
      }
    }

    syncToBackend()
  }, [isLoading, switchAccount, isAuthenticated]) // Removed 'mode' — toggleMode handles its own sync

  /**
   * Persist `newMode` and point the backend token at the matching row.
   *
   * Shared by toggleMode and the chooser so there is one implementation of
   * "become this profile" — the backend switch is not optional bookkeeping,
   * it is what makes the token's `sub` refer to the right identity.
   */
  const applyMode = async (newMode: Mode) => {
    const previous = mode
    setMode(newMode)

    try {
      await AsyncStorage.setItem(MODE_STORAGE_KEY, newMode)

      // Sync with backend if switchAccount is provided
      if (switchAccount) {
        const accountType = newMode === "seller" ? "agent" : "client"
        console.log(`🔄 Syncing backend account_type to: ${accountType}`)
        await switchAccount(accountType)
        console.log(`✅ Backend account_type synced successfully`)
      }
    } catch (error) {
      console.error("Failed to save mode or sync backend:", error)
      // Revert so the UI never claims a profile the token doesn't hold.
      setMode(previous)
      await AsyncStorage.setItem(MODE_STORAGE_KEY, previous)
      throw error
    }
  }

  const toggleMode = async () => {
    await applyMode(mode === "buyer" ? "seller" : "buyer").catch(() => { })
  }

  const setModeExplicitly = async (next: Mode) => {
    // No catch here: the chooser needs to know it failed so it can keep the
    // user on the screen rather than dropping them into an unconfirmed profile.
    if (next === mode) {
      // Already correct locally, but the token may still point at the other
      // row — a first-launch default of "buyer" was never synced anywhere.
      await applyMode(next)
      return
    }
    await applyMode(next)
  }

  const rememberChoice = async (remember: boolean) => {
    try {
      if (remember) {
        await AsyncStorage.setItem(REMEMBERED_CHOICE_KEY, "true")
      } else {
        await AsyncStorage.removeItem(REMEMBERED_CHOICE_KEY)
      }
      setHasRememberedChoice(remember)
    } catch (error) {
      console.error("Failed to persist profile choice preference:", error)
      setHasRememberedChoice(remember)
    }
  }

  const value: ModeContextType = {
    mode,
    toggleMode,
    setModeExplicitly,
    isSeller: mode === "seller",
    isBuyer: mode === "buyer",
    isLoading,
    hasRememberedChoice,
    rememberChoice,
  }

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>
}

export const useMode = (): ModeContextType => {
  const context = useContext(ModeContext)
  if (context === undefined) {
    throw new Error("useMode must be used within a ModeProvider")
  }
  return context
}
