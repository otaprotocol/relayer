import { Redis } from "@upstash/redis";
import { REDIS_KEY_PREFIX } from "../config/constants";

const redis = Redis.fromEnv();

export const getKey = (key: string) => {
    return `${REDIS_KEY_PREFIX}:${key}`;
}

export default redis;