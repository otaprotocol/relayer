import { getRelayerData } from './actions';

export default async function Home() {
    const data = await getRelayerData();

    return <div className="flex flex-col items-center justify-center h-screen">
        <pre className="text-sm">{JSON.stringify(data, null, 2)}</pre>
    </div>;
}