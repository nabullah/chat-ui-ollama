import { inject, Injectable, signal } from '@angular/core';
import { finalize, Observable, of, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { OllamaFacade } from '../../../core/ollama/ollama-facade';
import { StorageFacade } from '../../../core/storage/storage-facade';
import { Message } from '../models/message';
import { Session } from '../models/session';

@Injectable({
  providedIn: 'root',
})
export class ChatStore {
  private readonly ollamaFacade = inject(OllamaFacade);
  private readonly storageFacade = inject(StorageFacade);
  private readonly localStorageKey = 'nexusChat_sessions';

  private readonly $activeSessionId = signal<string | null>(null);
  readonly sessions = signal<Session[]>(this.loadSessions());
  readonly $sessions = this.sessions;
  readonly $isLoading = signal<boolean>(false);

  constructor() {
    if (this.sessions().length === 0) {
      this.createNewSession();
      return;
    }
    this.$activeSessionId.set(this.sessions()[0].id);
  }

  activeSession() {
    const id = this.$activeSessionId();
    if (!id) {
      return null;
    }
    return this.sessions().find((session) => session.id === id) || null;
  }

  createNewSession(): void {
    const newSession: Session = {
      id: uuidv4(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.update((sessions) => [...sessions, newSession]);
    this.$activeSessionId.set(newSession.id);
    this.saveSessions();
  }

  setActiveSession(sessionId: string): void {
    this.$activeSessionId.set(sessionId);
  }

  deleteSession(sessionId: string): void {
    const updatedSessions = this.sessions().filter(
      (session) => session.id !== sessionId
    );
    this.sessions.set(updatedSessions);

    if (this.$activeSessionId() === sessionId) {
      this.$activeSessionId.set(
        updatedSessions.length > 0 ? updatedSessions[0].id : null
      );
    }

    if (updatedSessions.length === 0) {
      this.createNewSession();
    }

    this.saveSessions();
  }

  updateSessionTitle(sessionId: string, title: string): void {
    this.sessions.update((sessions) =>
      sessions.map((session) => {
        if (session.id === sessionId) {
          return {
            ...session,
            title,
            updatedAt: new Date(),
          };
        }
        return session;
      })
    );

    this.saveSessions();
  }

  sendMessage(content: string, withContext = true): Observable<string> {
    const activeSession = this.activeSession();

    if (!activeSession) {
      console.error('No active session found');
      return of('');
    }

    this.$isLoading.set(true);

    const userMessage: Message = {
      id: uuidv4(),
      content,
      role: 'user',
      timestamp: new Date(),
    };

    const updatedSession = {
      ...activeSession,
      messages: [...activeSession.messages, userMessage],
      updatedAt: new Date(),
    };

    // Update session title if this is the first message and the session has the default title
    if (
      updatedSession.messages.length === 1 &&
      updatedSession.title === 'New Chat'
    ) {
      const title =
        content.length > 30 ? content.substring(0, 30) + '...' : content;

      updatedSession.title = title;
    }

    this.sessions.update((sessions) =>
      sessions.map((session) =>
        session.id === updatedSession.id ? updatedSession : session
      )
    );
    this.saveSessions();

    if (withContext) {
      // Format messages for the chat API with context
      const systemMessage: Pick<Message, 'role' | 'content'> = {
        role: 'system',
        content: `You are a helpful, emotionally aware AI assistant. 
        Analyze the tone, emotional state, and intent of the user silently.
        Based on that, respond with a clear, concise, emotionally appropriate reply.
        Your reply should match the user's tone and emotional state while staying within professional, respectful boundaries.`,
      };

      const formattedMessages = [
        systemMessage,
        ...updatedSession.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      ];

      return this.ollamaFacade.chat(formattedMessages).pipe(
        tap((response) => {
          const assistantMessage: Message = {
            id: uuidv4(),
            content: response,
            role: 'assistant',
            timestamp: new Date(),
          };

          const sessionWithResponse = {
            ...updatedSession,
            messages: [...updatedSession.messages, assistantMessage],
            updatedAt: new Date(),
          };

          this.sessions.update((sessions) =>
            sessions.map((session) =>
              session.id === sessionWithResponse.id
                ? sessionWithResponse
                : session
            )
          );
          this.saveSessions();
        }),
        finalize(() => {
          this.$isLoading.set(false);
        })
      );
    } else {
      // Send message without context using generate API
      return this.ollamaFacade.generate(content).pipe(
        tap((response) => {
          const assistantMessage: Message = {
            id: uuidv4(),
            content: response,
            role: 'assistant',
            timestamp: new Date(),
          };

          const sessionWithResponse = {
            ...updatedSession,
            messages: [...updatedSession.messages, assistantMessage],
            updatedAt: new Date(),
          };

          this.sessions.update((sessions) =>
            sessions.map((session) =>
              session.id === sessionWithResponse.id
                ? sessionWithResponse
                : session
            )
          );
          this.saveSessions();
        }),
        finalize(() => {
          this.$isLoading.set(false);
        })
      );
    }
  }

  private loadSessions(): Session[] {
    return this.storageFacade.getItem<Session[]>(this.localStorageKey, []);
  }

  private saveSessions(): void {
    this.storageFacade.setItem(this.localStorageKey, this.sessions());
  }
}
