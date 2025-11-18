import { Component, input, output } from '@angular/core';

@Component({
  selector: 'nexus-chat-panel',
  standalone: true,
  templateUrl: './chat-panel.html',
  styleUrl: './chat-panel.css'
})
export class ChatPanel {
  title = input.required<string>();
  withContext = input<boolean>(true);
  contextChange = output<boolean>();

  onContextChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.contextChange.emit(checked);
  }
}