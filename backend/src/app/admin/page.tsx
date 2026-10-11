import { isAdmin } from "@/lib/auth";
import { listMedia } from "@/lib/drive";
import { store } from "@/lib/store";
import {
  doHide,
  doLogin,
  doResync,
  doSaveSettings,
  doSkip,
  doUnhide,
} from "./actions";

export const dynamic = "force-dynamic";

const card: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: 16,
  marginBottom: 16,
};
const row: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

export default async function Admin() {
  if (!(await isAdmin())) {
    return (
      <main style={{ padding: 24, maxWidth: 420 }}>
        <h1>Frame admin</h1>
        <form action={doLogin} style={row}>
          <input
            name="password"
            type="password"
            placeholder="Password"
            autoFocus
            style={{ padding: 8, fontSize: 16, flex: 1 }}
          />
          <button type="submit" style={{ padding: "8px 16px", fontSize: 16 }}>
            Sign in
          </button>
        </form>
      </main>
    );
  }

  const [items, hidden, settings, heartbeat] = await Promise.all([
    listMedia().catch((e: Error) => e),
    store().getHidden(),
    store().getSettings(),
    store().getHeartbeat(),
  ]);

  if (items instanceof Error) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Frame admin</h1>
        <p style={{ color: "#b00" }}>
          Drive is not reachable: {items.message}
        </p>
        <p>Check the service-account env vars and that the folder is shared with it.</p>
      </main>
    );
  }

  const byId = new Map(items.map((i) => [i.id, i]));
  const now = heartbeat ? byId.get(heartbeat.itemId) : undefined;
  const hiddenItems = hidden.map((id) => byId.get(id)).filter((i) => i !== undefined);
  const stale =
    heartbeat && Date.now() - new Date(heartbeat.at).getTime() > 5 * 60_000;

  return (
    <main style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
      <h1>Frame admin</h1>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Now showing</h2>
        {heartbeat ? (
          <>
            {stale && (
              <p style={{ color: "#b00" }}>
                No heartbeat for over 5 minutes — the frame may be asleep or offline.
              </p>
            )}
            <div style={row}>
              {now && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`/api/media/${now.id}/${now.md5}.jpg`}
                  alt={now.caption || now.id}
                  style={{ width: 120, borderRadius: 6 }}
                />
              )}
              <div>
                <div>{now?.caption || <em>no caption</em>}</div>
                <small style={{ color: "#666" }}>
                  battery {heartbeat.battery}% · v{heartbeat.appVersion} ·{" "}
                  {new Date(heartbeat.at).toLocaleTimeString()}
                </small>
              </div>
            </div>
            <div style={{ ...row, marginTop: 12 }}>
              <form action={doSkip}>
                <button type="submit">Skip</button>
              </form>
              <form action={doResync}>
                <button type="submit">Resync</button>
              </form>
              {now && (
                <form action={doHide}>
                  <input type="hidden" name="id" value={now.id} />
                  <button type="submit">Hide this photo</button>
                </form>
              )}
            </div>
          </>
        ) : (
          <p>
            The frame has not reported in yet. {items.length} items are ready for it.
          </p>
        )}
      </section>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Settings</h2>
        <form action={doSaveSettings}>
          <div style={{ display: "grid", gap: 12 }}>
            <label>
              Seconds per photo{" "}
              <input
                name="intervalSec"
                type="number"
                min={5}
                max={3600}
                defaultValue={settings.intervalSec}
              />
            </label>
            <label>
              Crossfade (ms){" "}
              <input
                name="transitionMs"
                type="number"
                min={0}
                max={10000}
                step={100}
                defaultValue={settings.transitionMs}
              />
            </label>
            <label>
              Transition{" "}
              <select name="transition" defaultValue={settings.transition}>
                <option value="crossfade">Crossfade</option>
                <option value="kenburns">Ken Burns (test on device)</option>
              </select>
            </label>
            <label>
              Screen on at hour{" "}
              <input
                name="onHour"
                type="number"
                min={0}
                max={23}
                defaultValue={settings.onHour}
              />
            </label>
            <label>
              Screen off at hour{" "}
              <input
                name="offHour"
                type="number"
                min={0}
                max={23}
                defaultValue={settings.offHour}
              />
            </label>
            <label>
              Brightness (0-255){" "}
              <input
                name="brightness"
                type="number"
                min={0}
                max={255}
                defaultValue={settings.brightness}
              />
            </label>
            <label>
              <input
                name="showCaption"
                type="checkbox"
                defaultChecked={settings.showCaption}
              />{" "}
              Show caption
            </label>
            <label>
              <input name="showDate" type="checkbox" defaultChecked={settings.showDate} />{" "}
              Show today&apos;s date
            </label>
          </div>
          <button type="submit" style={{ marginTop: 16, padding: "8px 16px" }}>
            Save
          </button>
        </form>
        <p style={{ color: "#666" }}>
          <small>The frame picks up changes on its next command poll (~10s).</small>
        </p>
      </section>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Hidden ({hiddenItems.length})</h2>
        {hiddenItems.length === 0 && <p>Nothing hidden.</p>}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {hiddenItems.map((i) => (
            <form action={doUnhide} key={i.id} style={{ textAlign: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/media/${i.id}/${i.md5}.jpg`}
                alt={i.caption || i.id}
                style={{ width: 90, borderRadius: 6, display: "block" }}
              />
              <input type="hidden" name="id" value={i.id} />
              <button type="submit" style={{ marginTop: 4 }}>
                Unhide
              </button>
            </form>
          ))}
        </div>
      </section>

      <p style={{ color: "#666" }}>
        <small>
          {items.length} items in the library, {items.filter((i) => i.kind === "video").length}{" "}
          of them video.
        </small>
      </p>
    </main>
  );
}
