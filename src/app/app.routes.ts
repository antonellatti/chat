import { Routes } from '@angular/router';
import { ChatGlobal } from './components/chat/chat';

export const routes: Routes = [
  { path: '', component: ChatGlobal },
  { path: '**', redirectTo: '' }
];