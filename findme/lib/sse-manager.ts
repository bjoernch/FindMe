/**
 * Server-Sent Events manager for real-time location updates.
 * Manages client connections and broadcasts location updates.
 */

// Side-effect import: starts the pruning scheduler on first load
import "./pruning";

const MAX_CONNECTIONS_PER_USER = 5;

interface SSEClient {
  controller: ReadableStreamDefaultController;
  userId: string;
  connectedAt: number;
}

class SSEManager {
  private clients = new Map<string, SSEClient>();

  addClient(clientId: string, controller: ReadableStreamDefaultController, userId: string) {
    // Enforce per-user connection limit
    const userClients = this.getConnectionsForUser(userId);
    if (userClients.length >= MAX_CONNECTIONS_PER_USER) {
      // Close the oldest connection
      const oldest = userClients.sort((a, b) => a.connectedAt - b.connectedAt)[0];
      try {
        oldest.controller.close();
      } catch {
        // Already closed
      }
      // Find and remove the oldest client entry
      for (const [id, client] of this.clients.entries()) {
        if (client === oldest) {
          this.clients.delete(id);
          break;
        }
      }
    }

    this.clients.set(clientId, { controller, userId, connectedAt: Date.now() });
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

  /**
   * Get all connections for a specific user (for debugging and limit enforcement).
   */
  getConnectionsForUser(userId: string): SSEClient[] {
    const connections: SSEClient[] = [];
    for (const client of this.clients.values()) {
      if (client.userId === userId) {
        connections.push(client);
      }
    }
    return connections;
  }
}

// Singleton instance
export const sseManager = new SSEManager();
