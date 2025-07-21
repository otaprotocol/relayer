type ActionCodesRelayerErrorCode =
    | 'INVALID_PAYLOAD'
    | 'SIGNATURE_INVALID'
    | 'CODE_EXPIRED'
    | 'DUPLICATE_CODE'
    | 'CODE_NOT_FOUND'
    | 'TX_ALREADY_ATTACHED'
    | 'TX_MISSING'
    | 'UNSUPPORTED_CHAIN'
    | 'ADAPTER_NOT_FOUND'
    | 'INVALID_INTENT_TYPE'
    | 'UNKNOWN_ERROR';

export class ActionCodesRelayerError extends Error {
    public code: ActionCodesRelayerErrorCode;
    public status: number;
    public details?: Record<string, any>;

    constructor(
        code: ActionCodesRelayerErrorCode,
        message: string,
        status: number = 400,
        details?: Record<string, any>
    ) {
        super(message);
        this.name = 'ActionCodesRelayerError';
        this.code = code;
        this.status = status;
        this.details = details;
    }

    toJSON() {
        return {
            error: true,
            code: this.code,
            message: this.message,
            status: this.status,
            ...(this.details ? { details: this.details } : {})
        };
    }
}