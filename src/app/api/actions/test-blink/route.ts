import { ActionCodesClient } from '@actioncodes/sdk'
import { AttachRequestSchema, AttachResponseSchema } from "@actioncodes/relayer/schemas/attach";
import { ActionGetResponse, ActionPostResponse, ACTIONS_CORS_HEADERS, BLOCKCHAIN_IDS } from "@solana/actions";

const actionCodesClient = new ActionCodesClient();

const blockchain = BLOCKCHAIN_IDS.mainnet;

const headers = {
    ...ACTIONS_CORS_HEADERS,
    "x-blockchain-ids": blockchain,
    "x-action-version": "2.4",
};

export const GET = async () => {
    const response: ActionGetResponse = {
        type: 'action',
        title: 'Test Blink with Action Codes',
        description: "This blink demonstrates how to use action codes to interact with the blockchain.",
        label: 'Use Action Codes',
        icon: '',
        links: {
            actions: [
                {
                    type: 'message',
                    href: '/api/actions/test-blink?message={message}&action_code={action_code}',
                    label: 'Send Message',
                    parameters: [
                        {
                            name: 'message',
                            label: 'Message to sign',
                            type: 'text',
                            required: true,
                        },
                        {
                            name: 'action_code',
                            label: 'Action Code',
                            type: 'text',
                            required: true,
                        }
                    ]
                }
            ]
        }
    }

    return new Response(JSON.stringify(response), {
        status: 200,
        headers,
    });
};

export const POST = async (req: Request) => {
    try {
        const url = new URL(req.url);

        const message = url.searchParams.get("message");
        const action_code = url.searchParams.get("action_code");

        if (!message || !action_code) {
            return new Response(JSON.stringify({ error: "Missing required parameters" }), {
                status: 400,
                headers,
            });
        }

        await actionCodesClient.attachMessage(action_code, message);


        for await (const status of actionCodesClient.observeStatus(action_code)) {
            if (status.status === 'finalized') {
                const response: ActionPostResponse = {
                    type: 'message',
                    data: status.signedMessage ?? '',
                    links: {
                        next: {
                            type: 'post',
                            href: '/api/actions/test-blink?message={message}&action_code={action_code}',
                        }
                    }
                }

                return new Response(JSON.stringify(response), {
                    status: 200,
                    headers,
                });
            } else if (status.status === 'expired') {
                return new Response(JSON.stringify({ error: "Action code expired" }), {
                    status: 400,
                    headers,
                });
            } else if (status.status === 'error') {
                return new Response(JSON.stringify({ error: "Action code error" }), {
                    status: 400,
                    headers,
                });
            }
        }

    } catch (error) {
        // Log and return an error response
        console.error("Error processing request:", error);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers,
        });
    }
};

export const OPTIONS = async () => {
    return new Response(null, { headers });
};