/**
 * useExpirationChecker Hook
 *
 * Periodically checks active (completed) transactions for approaching
 * expiration and fires notifications at milestones: 30 days, 7 days,
 * 1 day, and expired. Uses AsyncStorage to avoid duplicate alerts.
 */

import { useEffect, useRef } from "react";
import AsyncStorage from "@/lib/storage";
import { Transaction } from "@/types/transaction";
import { useNotifications } from "@/contexts/NotificationContext";

const MILESTONES = [
    { days: 30, key: "30d", message: "expires in 30 days" },
    { days: 7, key: "7d", message: "expires in 7 days" },
    { days: 1, key: "1d", message: "expires tomorrow" },
    { days: 0, key: "expired", message: "has expired" },
];

function getStorageKey(txKey: string, milestone: string): string {
    return `expiration_notified_${txKey}_${milestone}`;
}

export function useExpirationChecker(transactions: Transaction[]) {
    const { addNotification } = useNotifications();
    const hasChecked = useRef(false);

    useEffect(() => {
        if (!transactions || transactions.length === 0) return;
        // Only check once per mount + when transactions update
        if (hasChecked.current) return;
        hasChecked.current = true;

        const checkExpirations = async () => {
            const now = Date.now();

            for (const tx of transactions) {
                if (!tx.expiresAt) continue;

                const daysRemaining = Math.floor((tx.expiresAt - now) / (1000 * 60 * 60 * 24));
                const title = tx.propertyDetails?.title || tx.property.description || "Property";

                for (const milestone of MILESTONES) {
                    if (daysRemaining <= milestone.days) {
                        const storageKey = getStorageKey(tx.key, milestone.key);

                        try {
                            const alreadyNotified = await AsyncStorage.getItem(storageKey);
                            if (alreadyNotified) continue;

                            // Fire notification
                            addNotification(
                                "general",
                                milestone.days === 0 ? "Agreement Expired" : "Expiration Warning",
                                `Your agreement for "${title}" ${milestone.message}.`
                            );

                            // Mark as notified
                            await AsyncStorage.setItem(storageKey, "1");
                        } catch {
                            // Skip on storage error
                        }

                        // Only fire the most urgent milestone per transaction
                        break;
                    }
                }
            }
        };

        checkExpirations();

        // Re-check every hour
        const interval = setInterval(() => {
            hasChecked.current = false;
        }, 60 * 60 * 1000);

        return () => clearInterval(interval);
    }, [transactions, addNotification]);
}

export default useExpirationChecker;
