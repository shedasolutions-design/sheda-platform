/**
 * Offer/Bid Type Definitions
 * 
 * These types define the structure of offer messages sent between buyers and sellers.
 * Offers are sent as structured JSON messages in the chat system.
 */

export enum OfferStatus {
    PENDING = 'pending',
    ACCEPTED = 'accepted',
    REJECTED = 'rejected',
}

export interface OfferMessage {
    type: 'offer';
    offerId: string;
    propertyId: number;
    propertyTitle: string;
    propertyImage?: string;
    offeredPrice: number;
    originalPrice: number;
    buyerId: number;
    buyerName: string;
    sellerId: number;
    status: OfferStatus;
    bidId?: number; // Blockchain bid ID from contract
    blockchainPropertyId?: number; // On-chain property ID for contract calls
    timestamp: string;
}

export interface OfferResponseMessage {
    type: 'offer_response';
    offerId: string;
    status: 'accepted' | 'rejected';
    propertyId: number; // on-chain blockchain property id
    propertyTitle: string;
    acceptedPrice?: number;
    message: string;
    timestamp: string;
    // Needed to route "Book Appointment" to the real booking flow —
    // without these it can't tell useTransactions/the backend which bid
    // this appointment belongs to, or who the seller is.
    bidId?: number;
    sellerId?: number;
}

/**
 * Helper function to check if a message is an offer
 */
export function isOfferMessage(message: string): boolean {
    try {
        const parsed = JSON.parse(message);
        return parsed.type === 'offer';
    } catch {
        return false;
    }
}

/**
 * Helper function to check if a message is an offer response
 */
export function isOfferResponseMessage(message: string): boolean {
    try {
        const parsed = JSON.parse(message);
        return parsed.type === 'offer_response';
    } catch {
        return false;
    }
}

/**
 * Helper function to parse offer message.
 * Only parses structured JSON offers (type: 'offer').
 * Legacy plain text bid messages are displayed as regular chat messages.
 */
export function parseOfferMessage(message: string): OfferMessage | null {
    try {
        const parsed = JSON.parse(message);
        console.log('🔍 Offer Parse: Successfully parsed JSON:', parsed);

        if (parsed.type === 'offer') {
            console.log('✅ Offer Parse: Valid offer message detected');
            return parsed as OfferMessage;
        }

        console.log('⚠️ Offer Parse: JSON but not an offer. Type:', parsed.type);
        return null;
    } catch (err) {
        // Not JSON, regular text message - this is normal, don't log
        return null;
    }
}

/**
 * Helper function to parse offer response message
 */
export function parseOfferResponseMessage(message: string): OfferResponseMessage | null {
    try {
        const parsed = JSON.parse(message);
        if (parsed.type === 'offer_response') {
            return parsed as OfferResponseMessage;
        }
        return null;
    } catch {
        return null;
    }
}
