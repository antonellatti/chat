import { Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, ViewChild, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase';


interface Mensaje {
  id: string;
  nickname: string;
  mensaje: string;
  archivo_url?: string;
  archivo_tipo?: string;
  destinatario?: string;
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
  
  // Setter reactivo: detecta cuándo el input aparece en el HTML gracias al @if
  private elInputDelMensaje?: ElementRef<HTMLInputElement>;
  @ViewChild('mensajeInput') set mensajeInputRef(element: ElementRef<HTMLInputElement> | undefined) {
    this.elInputDelMensaje = element;
    if (element) {
      this.elInputDelMensaje = element;
      setTimeout(() => element.nativeElement.focus(), 70);
    }
  }
  // input de Nickname
  @ViewChild('nicknameInput') set nicknameInputRef(element: ElementRef<HTMLInputElement> | undefined) {
    if (element) {
      setTimeout(() => element.nativeElement.focus(), 70);
    }
  }
  

  mensajes: Mensaje[] = [];
  nuevoMensaje = '';
  nickname = '';
  nicknameTemporal = '';
  nicknameListo = false;
  cargando = false;
  suscripcion: any;
  esAntonella = false;
  usuarioSeleccionado = '';
  usuarios: string[] = [];

  constructor(
    private supabase: SupabaseService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  async ngOnInit() {
    const guardado = sessionStorage.getItem('chat_nickname');
    if (guardado) {
      this.nickname = guardado;
      this.esAntonella = guardado.toLowerCase() === 'antonella';
      this.nicknameListo = true;
      await this.cargarMensajes();
      if (this.esAntonella) await this.cargarUsuarios();
      this.suscribirseAlChat();
    }
  }

  async confirmarNickname() {
    const nick = this.nicknameTemporal.trim();
    if (!nick) return;
  
    if (nick.toLowerCase() === 'antonella') {
      const password = prompt('Contraseña:');
      if (password !== 'putoelquelee') {
        alert('No sos Antonella, poné tu nombre!');
        return;
      }
    }
    this.mensajes = [];
    this.usuarioSeleccionado = '';
    this.nickname = nick;
    this.esAntonella = nick.toLowerCase() === 'antonella';
    this.nicknameListo = true;
  
    sessionStorage.setItem('chat_nickname', nick);
  
    await this.cargarMensajes();
  
    if (this.esAntonella) {
      await this.cargarUsuarios();
    }
    if (this.suscripcion) {
      this.supabase.client.removeChannel(this.suscripcion);
      this.suscripcion = null;
    }
    this.suscribirseAlChat();
    this.cdr.detectChanges();
  }

  async cargarMensajes() {
    let query = this.supabase.client
      .from('chat_mensajes')
      .select('*')
      .order('created_at', { ascending: true });
  
    if (this.esAntonella) {
      if (this.usuarioSeleccionado) {
        query = query.or(
          `and(nickname.eq.${this.usuarioSeleccionado},destinatario.eq.antonella),and(nickname.eq.antonella,destinatario.eq.${this.usuarioSeleccionado})`
        );
      } else {
        this.mensajes = [];
        this.cdr.detectChanges();
        return;
      }
    } else {
      query = query.or(
        `and(nickname.eq.${this.nickname},destinatario.eq.antonella),and(nickname.eq.antonella,destinatario.eq.${this.nickname})`
      );
    }
    const { data } = await query;
  
    if (data) {
      this.mensajes = data.filter(m => m.nickname !== '__system__');
      this.cdr.detectChanges();
      this.scrollAbajo();
    }
  }

  async cargarUsuarios() {
    const { data } = await this.supabase.client
      .from('chat_mensajes')
      .select('nickname')
      .eq('destinatario', 'antonella')
      .neq('nickname', 'antonella');
  
    if (data) {
      this.usuarios = [...new Set(data.map(m => m.nickname))];
      this.cdr.detectChanges();
    }
  }

  suscribirseAlChat() {
    this.suscripcion = this.supabase.client
      .channel('chat-mensajes-canal')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'chat_mensajes' }, // Modificado: '*' para escuchar INSERT y DELETE
        (payload) => {
          this.ngZone.run(async () => {
            
            // SI EL EVENTO ES UN BORRADO
            if (payload.eventType === 'DELETE') {
              this.mensajes = [];
              this.usuarios = [];
              this.usuarioSeleccionado = '';
              this.cdr.detectChanges();
              return;
            }

            // SI EL EVENTO ES UN INSERT (Tu código original mejorado)
            if (payload.eventType === 'INSERT') {
              const msg = payload.new as Mensaje;

              if (msg.nickname === '__system__' && msg.mensaje === '__clear__') {
                this.mensajes = [];
                this.usuarios = [];
                this.usuarioSeleccionado = '';
                this.cdr.detectChanges();
                return;
              }

              if (this.esAntonella) {
                await this.cargarUsuarios();
                if (this.usuarioSeleccionado) {
                  const esDeConversacionActiva =
                    (msg.nickname === this.usuarioSeleccionado && msg.destinatario === 'antonella') ||
                    (msg.nickname === 'antonella' && msg.destinatario === this.usuarioSeleccionado);
                  if (esDeConversacionActiva) {
                    this.mensajes.push(msg);
                    this.cdr.detectChanges();
                    this.scrollAbajo();
                  }
                }
              } else {
                if (
                  (msg.nickname === this.nickname && msg.destinatario === 'antonella') ||
                  (msg.nickname === 'antonella' && msg.destinatario === this.nickname)
                ) {
                  this.mensajes.push(msg);
                  this.cdr.detectChanges();
                  this.scrollAbajo();
                }
              }
            }
          });
        }
      )
      .subscribe((status) => {
        console.log('Realtime status:', status);
      });
  }
  
  seleccionarUsuario(usuario: string) {
    this.usuarioSeleccionado = usuario;
    this.cargarMensajes();
    this.cdr.detectChanges();
  }

  async enviarMensaje() {
    if (!this.nuevoMensaje.trim() || !this.nicknameListo) return;
    if (this.esAntonella && !this.usuarioSeleccionado) return;
    this.cargando = true;
  
    const { error } = await this.supabase.client
      .from('chat_mensajes')
      .insert({
        nickname: this.nickname,
        mensaje: this.nuevoMensaje.trim(),
        destinatario: this.esAntonella ? this.usuarioSeleccionado : 'antonella'
      });
  
    if (error) {
      this.errorEnvio = error.message;
      this.cdr.detectChanges();
    }
  
    this.nuevoMensaje = '';
    this.cargando = false;
    this.cdr.detectChanges();
  
    setTimeout(() => {
      if (this.elInputDelMensaje) {
        this.elInputDelMensaje.nativeElement.focus();
      }
    }, 50);
  }

  async subirArchivo(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    if (this.esAntonella && !this.usuarioSeleccionado) return;
  
    this.cargando = true;
    const extension = file.name.split('.').pop();
    const nombre = `${Date.now()}.${extension}`;
  
    const { error } = await this.supabase.client.storage
      .from('chat-archivos')
      .upload(nombre, file);
  
    if (error) {
      console.error('Error subiendo archivo:', error);
      this.cargando = false;
      return;
    }
    const { data: urlData } = this.supabase.client.storage
      .from('chat-archivos')
      .getPublicUrl(nombre);
  
    await this.supabase.client
      .from('chat_mensajes')
      .insert({
        nickname: this.nickname,
        mensaje: '',
        archivo_url: urlData.publicUrl,
        archivo_tipo: file.type,
        destinatario: this.esAntonella ? this.usuarioSeleccionado : 'antonella'
      });
    this.cargando = false;
    this.cdr.detectChanges();
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
    if (this.suscripcion) {
      this.supabase.client.removeChannel(this.suscripcion);
      this.suscripcion = null;
    }
    this.mensajes = [];
    this.usuarioSeleccionado = '';
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
  
    if (error) {
      console.error(error);
      return;
    }
    // Limpieza local inmediata de la interfaz
    this.mensajes = [];
    this.usuarios = [];
    this.usuarioSeleccionado = '';
    this.cdr.detectChanges();
  }

  ngOnDestroy() {
    if (this.suscripcion) {
      this.supabase.client.removeChannel(this.suscripcion);
    }
  }
}