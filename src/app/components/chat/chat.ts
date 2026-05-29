import { Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, ViewChild, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase';
import { RouterLink } from '@angular/router';

interface Mensaje {
  id: string;
  nickname: string;
  mensaje: string;
  created_at: string;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.html',
  styleUrl: './chat.css'
})
export class ChatGlobal implements OnInit, OnDestroy {
  @ViewChild('mensajesContainer') mensajesContainer!: ElementRef;
  @ViewChild('mensajeInput') mensajeInput!: ElementRef;

  mensajes: Mensaje[] = [];
  nuevoMensaje = '';
  nickname = '';
  nicknameTemporal = '';
  nicknameListo = false;
  cargando = false;
  suscripcion: any;

  constructor(
    private supabase: SupabaseService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  async ngOnInit() {
    // Recuperar nickname si ya lo puso antes en esta sesión
    const guardado = sessionStorage.getItem('chat_nickname');
    if (guardado) {
      this.nickname = guardado;
      this.nicknameListo = true;
      await this.cargarMensajes();
      this.suscribirseAlChat();
    }
  }
  confirmarNickname() {
    const nick = this.nicknameTemporal.trim();
    if (!nick) return;
    this.nickname = nick;
    this.nicknameListo = true;
    sessionStorage.setItem('chat_nickname', nick);
    this.cargarMensajes();
    
    // Cerrar canal anterior antes de crear uno nuevo
    if (this.suscripcion) {
      this.supabase.client.removeChannel(this.suscripcion);
      this.suscripcion = null;
    }
    
    this.suscribirseAlChat();
    this.cdr.detectChanges();
  }
  async cargarMensajes() {
    const { data } = await this.supabase.client
      .from('chat_mensajes')
      .select('*')
      .order('created_at', { ascending: true });

    if (data) {
      this.mensajes = data.filter(m => m.nickname !== '__system__');
      this.cdr.detectChanges();
      this.scrollAbajo();
    }
  }
  suscribirseAlChat() {
    this.suscripcion = this.supabase.client
      .channel('chat-mensajes-canal')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_mensajes' },
        (payload) => {
          this.ngZone.run(() => {
            const msg = payload.new as Mensaje;
            if (msg.nickname === '__system__' && msg.mensaje === '__clear__') {
              this.mensajes = [];
            } else {
              this.mensajes.push(msg);
            }
            this.cdr.detectChanges();
            this.scrollAbajo();
          });
        }
      )
      .subscribe((status) => {
        console.log('Realtime status:', status);
      });
  }
  async enviarMensaje() {
    if (!this.nuevoMensaje.trim() || !this.nicknameListo) return;
    this.cargando = true;

    await this.supabase.client
      .from('chat_mensajes')
      .insert({
        nickname: this.nickname,
        mensaje: this.nuevoMensaje.trim()
      });
    this.nuevoMensaje = '';
    this.cargando = false;
    this.cdr.detectChanges();

    setTimeout(() => {
      this.mensajeInput.nativeElement.focus();
    }, 50);
  }
  esMio(mensaje: Mensaje): boolean {
    return mensaje.nickname === this.nickname;
  }
  formatearHora(fecha: string): string {
    return new Date(fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
  scrollAbajo() {
    setTimeout(() => {
      if (this.mensajesContainer) {
        this.mensajesContainer.nativeElement.scrollTop = this.mensajesContainer.nativeElement.scrollHeight;
      }
    }, 100);
  }
  volverNickname() {
    sessionStorage.removeItem('chat_nickname');
    this.nicknameListo = false;
    this.nickname = '';
    this.nicknameTemporal = '';
    this.cdr.detectChanges();
  }
  async limpiarChat() {
    const { error } = await this.supabase.client
      .from('chat_mensajes')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
  
    console.log('Delete error:', error);
  
    await new Promise(resolve => setTimeout(resolve, 500));
  
    await this.supabase.client
      .from('chat_mensajes')
      .insert({
        nickname: '__system__',
        mensaje: '__clear__'
      });
  
    this.mensajes = [];
    this.cdr.detectChanges();
  }
  ngOnDestroy() {
    if (this.suscripcion) {
      this.supabase.client.removeChannel(this.suscripcion);
    }
  }
}