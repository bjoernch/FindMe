import AsyncStorage from "@react-native-async-storage/async-storage";

const QUEUE_KEY = "findme_location_queue";
const MAX_QUEUE_SIZE = 50;
const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

export interface QueuedLocationUpdate {
  lat: number;
  lng: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  batteryLevel?: number;
  timestamp: number;
  deviceToken: string;
  serverUrl: string;
}

export async function enqueue(entry: QueuedLocationUpdate): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue: QueuedLocationUpdate[] = raw ? JSON.parse(raw) : [];
    queue.push(entry);
    // FIFO eviction
    while (queue.length > MAX_QUEUE_SIZE) queue.shift();
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error("[FindMe] Queue enqueue failed:", err);
  }
}

export async function dequeueAll(): Promise<QueuedLocationUpdate[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    await AsyncStorage.removeItem(QUEUE_KEY);
    if (!raw) return [];
    const queue: QueuedLocationUpdate[] = JSON.parse(raw);
    const now = Date.now();
    return queue.filter((e) => now - e.timestamp < MAX_AGE_MS);
  } catch (err) {
    console.error("[FindMe] Queue dequeue failed:", err);
    return [];
  }
}
