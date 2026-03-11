/**
 * Server-Sent Events manager for real-time location updates.
 * Manages client connections and broadcasts location updates.
 */

interface SSEClient {
  controller: ReadableStreamDefaultController;
  userId: string;
}

class SSEManager {
  private clients = new Map<string, SSEClient>();

  addClient(clientId: string, controller: ReadableStreamDefaultController, userId: string) {
    this.clients.set(clientId, { controller, userId });
  }

  removeClient(clientId: string) {
    this.clients.delete(clientId);
  }

  /**
   * Broadcast a location update to all connected clients who share with the given userId.
   * In practice, we broadcast to:
   * - The user themselves (their own devices)
   * - Users who have an accepted PeopleShare with them
   */
  broadcastToUser(userId: string, event: string, data: unknown) {
    const encoder = new TextEncoder();
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    for (const [clientId, client] of this.clients.entries()) {
      if (client.userId === userId) {
        try {
          client.controller.enqueue(encoder.encode(message));
        } catch {
          // Client disconnected
          this.clients.delete(clientId);
        }
      }
    }
  }

  /**
   * Broadcast to multiple user IDs (the owner + their connected people).
   */
  broadcastToUsers(userIds: string[], event: string, data: unknown) {
    for (const userId of userIds) {
      this.broadcastToUser(userId, event, data);
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

// Singleton instance
export const sseManager = new SSEManager();
