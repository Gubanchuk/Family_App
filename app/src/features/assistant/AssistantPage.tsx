import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { localDb, type LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import Icon from '../shell/Icon';
import { resizePhoto } from '../../lib/image';
import ActionCard from './ActionCard';
import Markdown from './Markdown';
import { imageFromBlob, useAssistant, type AssistantSession } from './loop';
import { asScreen, SCREEN_NAME, suggestionsFor } from './suggestions';
import type { AssistantImage } from './types';

// «Помощник»: one conversation per person, kept on this phone. Opened from Home or a section's header
// (?from=), with a question to send at once from Home's card (router state q).
export default function AssistantPage({ me, members, db = localDb, session }: { me: Member; members: Member[]; db?: LocalDb; session?: AssistantSession }) {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const screen = asScreen(params.get('from'));
  const a = useAssistant(me, members, screen, { db, session });
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<Array<{ url: string; image: AssistantImage }>>([]);
  const [photoNote, setPhotoNote] = useState('');
  // Opened from a section into an ongoing conversation: that section's questions wait above the field until
  // something is sent.
  const [sentHere, setSentHere] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const asked = useRef(false);

  // A question typed on Home goes once, as soon as the conversation is read from the phone.
  useEffect(() => {
    const q = (location.state as { q?: string } | null)?.q;
    if (!q || !a.loaded || asked.current) return;
    asked.current = true;
    // Sent once: going back and forth must not ask it again.
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    void a.send(q);
  }, [a.loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [a.items.length, a.thinking]);

  const submit = async (q = text) => {
    if (a.busy || (!q.trim() && !photos.length)) return;
    const draft = { text, photos };
    setText(''); setPhotos([]); setPhotoNote(''); setSentHere(true);
    const sent = await a.send(q.trim() || 'Посмотри фото', draft.photos.map((p) => p.image));
    if (!sent) { setText(draft.text); setPhotos(draft.photos); }
  };
  const addPhoto = async (f: File | undefined) => {
    if (!f) return;
    try {
      const { blob } = await resizePhoto(f, 1280, 0.8);
      const image = await imageFromBlob(blob);
      setPhotos((p) => [...p, { url: URL.createObjectURL(blob), image }].slice(-3));
      setPhotoNote('');
    } catch {
      setPhotoNote('Не получилось открыть фото. Попробуйте другое.');
    }
  };

  const empty = a.loaded && a.items.length === 0;
  return (
    <div className="asst">
      <header className="k-head sub asst-head">
        <button type="button" className="round-btn" aria-label="Назад" onClick={() => navigate(-1)}><Icon name="back" /></button>
        <div className="asst-title"><h1>Помощник</h1><p>{screen === 'home' ? 'знает наше меню, покупки и дела' : `вы пришли из раздела «${SCREEN_NAME[screen]}»`}</p></div>
        {a.items.length ? <button type="button" className="btn soft sm" aria-label="Новый разговор" disabled={a.busy} onClick={() => void a.newThread()}>Новый</button> : null}
      </header>

      <div className="asst-log" aria-live="polite">
        {a.wasReset ? <p className="note asst-note">Прошлый разговор стал слишком длинным, начали новый.</p> : null}
        {empty ? (
          <div className="asst-empty">
            <p className="asst-hello">Привет, {me.name}! Спроси что угодно по дому или попроси что-то сделать — например, добавить продукты в поход.</p>
            <div className="asst-sugs">
              {suggestionsFor(screen, me.role).map((q) => <button key={q} type="button" className="pick ask-sug" onClick={() => void submit(q)}>{q}</button>)}
            </div>
          </div>
        ) : null}
        {a.items.map((it) => (it.type === 'user' ? (
          <div className="msg me" key={it.key}>
            {it.images.length ? <div className="msg-photos">{it.images.map((src, k) => <img key={k} src={src} alt="Фото к вопросу" />)}</div> : null}
            {it.text ? <p>{it.text}</p> : null}
          </div>
        ) : it.type === 'assistant' ? (
          <div className="msg bot" key={it.key}><Markdown text={it.text} /></div>
        ) : <ActionCard key={it.key} card={it.card} />))}
        {a.thinking ? <div className="msg bot typing" role="status" aria-label="Помощник думает"><span /><span /><span /></div> : null}
        <div ref={end} />
      </div>

      <div className="asst-input">
        {a.error ? (
          <div className="asst-error" role="alert"><span>{a.error}</span>
            {/* A refused question stays in the conversation and would be refused again: start afresh instead. */}
            {a.errorCode === 'refusal'
              ? <button type="button" className="btn soft sm" disabled={a.busy} onClick={() => void a.newThread()}>Новый разговор</button>
              : <button type="button" className="btn soft sm" disabled={a.busy} onClick={() => void a.retry()}>Повторить</button>}
          </div>
        ) : null}
        {photoNote ? <p className="note" role="status" style={{ margin: '0 0 6px' }}>{photoNote}</p> : null}
        {!empty && !sentHere && screen !== 'home' && !a.busy && !text ? (
          <div className="asst-quick" aria-label={`Вопросы для раздела «${SCREEN_NAME[screen]}»`}>
            {suggestionsFor(screen, me.role).map((q) => <button key={q} type="button" className="pick ask-sug" onClick={() => void submit(q)}>{q}</button>)}
          </div>
        ) : null}
        {photos.length ? (
          <div className="asst-attach">
            {photos.map((p, k) => (
              <span key={p.url} className="asst-thumb"><img src={p.url} alt={`Фото ${k + 1}`} />
                <button type="button" aria-label={`Убрать фото ${k + 1}`} onClick={() => setPhotos((x) => x.filter((_, i) => i !== k))}><Icon name="x" /></button>
              </span>
            ))}
          </div>
        ) : null}
        <form className="ask-row" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <button type="button" className="round-btn asst-photo" aria-label="Приложить фото" disabled={a.busy} onClick={() => file.current?.click()}><Icon name="photo" /></button>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { void addPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          <label className="vh" htmlFor="asst-text">Сообщение помощнику</label>
          <textarea id="asst-text" rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="Спроси или попроси" maxLength={2000}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); } }} />
          <button type="submit" className="round-btn ask-send" aria-label="Отправить" disabled={a.busy || (!text.trim() && !photos.length)}><Icon name="send" /></button>
        </form>
      </div>
    </div>
  );
}
