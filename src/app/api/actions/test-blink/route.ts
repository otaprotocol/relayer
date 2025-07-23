import { ActionGetResponse, ACTIONS_CORS_HEADERS, BLOCKCHAIN_IDS } from "@solana/actions";

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

export const OPTIONS = async () => {
    return new Response(null, { headers });
};