/* global React, ReactDOM */
const { useEffect, useMemo, useState } = React;

// --- Utility helpers ---
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
function parseCSVToBlocks(input) {
  return input
    .split(/[\,;]+/) // split on comma, semicolon, CR or LF (one or more)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((text) => ({ id: uid(), text }));
}

function woodTextureStyle(seed = 0) {
  // Simple, lightweight faux wood texture using layered gradients
  const hue = 34 + (seed % 6) - 3; // small variation
  const base = `hsl(${hue} 55% 62%)`;
  const dark = `hsl(${hue} 52% 56%)`;
  return {
    backgroundImage: `
      linear-gradient(0deg, rgba(255,255,255,0.07), rgba(0,0,0,0.08)),
      repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 4px, rgba(0,0,0,0.05) 4px, rgba(0,0,0,0.05) 8px),
      linear-gradient(90deg, ${base}, ${dark})
    `,
    boxShadow:
      "0 2px 0 rgba(0,0,0,0.15), 0 8px 16px rgba(0,0,0,0.12), inset 0 0 0 1px rgba(0,0,0,0.12)",
  };
}

function JengaConfigurator() {
  const [unsorted, setUnsorted] = useState([]); // Array of {id, text}
  const [categories, setCategories] = useState([]); // Array of {id, name, blocks: []}

  const [csv, setCsv] = useState("");
  const [newCategory, setNewCategory] = useState("");

  // Generation params (defaults mirror make_jenga_layout.py)
  const [params, setParams] = useState({
    bed_w: 381.0,
    bed_h: 305.0,
    block_w: 75.0,
    block_h: 25.0,
    spacing: 2.0,
    page_margin: 6.0,
    raster_margin: 1.0,
    template_tol: 0.5,
    title_mm: "",
    title_sub_gap_mm: 0.6,
    dot_mm: 1.5,
    dot_gap_mm: 0.9,
    dot_vgap_mm: 0.6,
    icon_ratio: 0.20,
    text_icon_gap_mm: 1.6,
    line_height: 1.08,
    preview_dpi: 300,
    icon_white_threshold: 200,
    show_dots: true,
  });

  // Per-category dots (override); stored by category id
  const [catDots, setCatDots] = useState({}); // { [catId]: number }

  // Bulk image uploads per category (by category id)
  const [uploads, setUploads] = useState({}); // { [catId]: File[] }

  // Font uploads
  const [titleFont, setTitleFont] = useState(null);
  const [subtitleFont, setSubtitleFont] = useState(null);
  // Color mode
  const [colorMode, setColorMode] = useState("bw"); // 'bw' | 'color'
  const [titleColor, setTitleColor] = useState("#000000");
  const [subtitleColor, setSubtitleColor] = useState("#000000");
  const [bgStyle, setBgStyle] = useState("solid"); // 'solid' | 'per-category' | 'gradient'
  const [bgSolid, setBgSolid] = useState("#ffffff");
  const [bgPerCat, setBgPerCat] = useState({}); // { [catId]: hex }
  const [bgGradStart, setBgGradStart] = useState("#ffffff");
  const [bgGradEnd, setBgGradEnd] = useState("#e5e5e5");
  const [dotColor, setDotColor] = useState("#000000");

  // Generate handling
  const [isGenerating, setIsGenerating] = useState(false);
  const [zipUrl, setZipUrl] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [apiAlive, setApiAlive] = useState(null); // null = unknown, true/false

  // Menu/picker for click-to-move
  const [picker, setPicker] = useState(null); // { x, y, blockId, from }

  // JSON copy/paste state
  const [jsonPaste, setJsonPaste] = useState("");
  const exportText = useMemo(() => {
    const out = {};
    categories.forEach((c) => {
      out[c.name] = c.blocks.map((b) => b.text);
    });
    return JSON.stringify(out, null, 2);
  }, [categories]);

  const stats = useMemo(() => {
    const inCats = categories.reduce((acc, c) => acc + c.blocks.length, 0);
    return {
      unsorted: unsorted.length,
      sorted: inCats,
      total: unsorted.length + inCats,
    };
  }, [unsorted, categories]);

  function addBlocksFromCsv() {
    const blocks = parseCSVToBlocks(csv);
    if (blocks.length === 0) return;
    setUnsorted((prev) => [...prev, ...blocks]);
    setCsv("");
  }

  function addCategory() {
    const name = newCategory.trim() || `Category ${categories.length + 1}`;
    setCategories((prev) => [...prev, { id: uid(), name, blocks: [] }]);
    setNewCategory("");
  }

  function removeCategory(catId) {
    // Move its blocks back to unsorted, then remove the category
    const cat = categories.find((c) => c.id === catId);
    if (!cat) return;
    setUnsorted((u) => [...u, ...cat.blocks]);
    setCategories((prev) => prev.filter((c) => c.id !== catId));
    setUploads((u) => {
      const x = { ...u };
      delete x[catId];
      return x;
    });
    setCatDots((d) => {
      const x = { ...d };
      delete x[catId];
      return x;
    });
  }

  function renameCategory(catId, nextName) {
    setCategories((prev) => prev.map((c) => (c.id === catId ? { ...c, name: nextName } : c)));
  }

  // --- Helpers to find/update blocks ---
  function getBlockText(blockId, from) {
    if (from === "unsorted") {
      return unsorted.find((b) => b.id === blockId)?.text ?? "";
    }
    const cat = categories.find((c) => c.id === from);
    return cat?.blocks.find((b) => b.id === blockId)?.text ?? "";
  }

  function saveBlockText({ blockId, from, newText }) {
    const t = (newText ?? "").trim();
    if (!t) return; // ignore empty
    if (from === "unsorted") {
      setUnsorted((prev) => prev.map((b) => (b.id === blockId ? { ...b, text: t } : b)));
    } else {
      setCategories((prev) =>
        prev.map((c) =>
          c.id === from
            ? { ...c, blocks: c.blocks.map((b) => (b.id === blockId ? { ...b, text: t } : b)) }
            : c
        )
      );
    }
  }

  // --- Move logic (no DnD; click-to-move) ---
  function moveBlock({ blockId, from, to, newText }) {
    if (from === to) {
      // Still allow text update in-place
      if (typeof newText === "string") saveBlockText({ blockId, from, newText });
      return;
    }

    const nextUnsorted = [...unsorted];
    const nextCategories = categories.map((c) => ({ ...c, blocks: [...c.blocks] }));

    let movedBlock = null;

    if (from === "unsorted") {
      const idx = nextUnsorted.findIndex((b) => b.id === blockId);
      if (idx >= 0) movedBlock = nextUnsorted.splice(idx, 1)[0];
    } else {
      const srcCat = nextCategories.find((c) => c.id === from);
      if (srcCat) {
        const idx = srcCat.blocks.findIndex((b) => b.id === blockId);
        if (idx >= 0) movedBlock = srcCat.blocks.splice(idx, 1)[0];
      }
    }

    if (!movedBlock) return;

    // Apply text change if provided
    if (typeof newText === "string" && newText.trim().length) {
      movedBlock = { ...movedBlock, text: newText.trim() };
    }

    if (to === "unsorted") {
      nextUnsorted.push(movedBlock);
    } else {
      const destCat = nextCategories.find((c) => c.id === to);
      if (!destCat) return;
      destCat.blocks.push(movedBlock);
    }

    setUnsorted(nextUnsorted);
    setCategories(nextCategories);
  }

  // Open picker near click position
  function openPicker(e, blockId, from) {
    const x = (e.clientX ?? 0) + 8;
    const y = (e.clientY ?? 0) + 8;
    setPicker({ x, y, blockId, from });
  }

  function closePicker() {
    setPicker(null);
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") closePicker();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Ping API
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/ping");
        setApiAlive(res.ok);
      } catch {
        setApiAlive(false);
      }
    })();
  }, []);

  const totalUploadBytes = useMemo(() => {
    let sum = 0;
    Object.values(uploads).forEach((arr) => {
      (arr || []).forEach((f) => (sum += f.size || 0));
    });
    return sum;
  }, [uploads]);

  // --- JSON copy/paste helpers ---
  function loadFromJsonText() {
    try {
      const obj = JSON.parse(jsonPaste);
      if (typeof obj !== "object" || Array.isArray(obj)) throw new Error("Invalid shape");
      const nextCats = Object.entries(obj).map(([name, list]) => ({
        id: uid(),
        name,
        blocks: Array.isArray(list)
          ? list
              .filter((t) => typeof t === "string" && t.trim().length > 0)
              .map((text) => ({ id: uid(), text: text.trim() }))
          : [],
      }));
      setCategories(nextCats);
      setUnsorted([]);
    } catch (err) {
      alert(
        "Couldn't load. Paste a valid JSON object in correct format"
      );
    }
  }

  async function copyExport() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(exportText);
      } else {
        const ta = document.createElement("textarea");
        ta.value = exportText;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
    } catch (e) {
      console.error("Copy failed", e);
    }
  }

  // --- UI Blocks ---
function Block({ block, from }) {
  const m = /^\*([^*]+)\*\s*(.*)$/.exec(block.text);
  const title = m ? m[1].trim() : null;
  const subtitle = m ? m[2].trim() : null;

  return (
    <button
      type="button"
      onClick={(e) => openPicker(e, block.id, from)}
      className="group w-full text-left select-none rounded-xl px-3 py-2 text-sm md:text-base text-[#4a2c2a] transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-amber-600"
      style={woodTextureStyle(block.id.length)}
      title="Click to move or edit"
    >
      <div className="flex items-center justify-between gap-3">
        {title ? (
          <span className="block leading-snug">
            <span className="block font-bold">{title}</span>
            {subtitle && <span className="block text-sm text-[#2d1c1a]">{subtitle}</span>}
          </span>
        ) : (
          <span className="block font-medium leading-snug">{block.text}</span>
        )}
      </div>
    </button>
  );
}

  function Column({ title, catId, blocks, onRename, onRemove, fullWidth = false, dotsValue, onDotsChange, onUploadChange, bgValue, onBgChange }) {
    const isUnsorted = catId === "unsorted";
    const [editing, setEditing] = useState(false);
    const [nameDraft, setNameDraft] = useState(title);

    return (
      <div className={`${fullWidth ? "w-full" : "w-80 shrink-0"}`}>
        <div
          className={`mb-3 flex items-center justify-between rounded-xl px-4 py-2 text-sm font-semibold text-white`}
          style={{
            ...woodTextureStyle((title || "").length),
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.1), 0 8px 14px rgba(0,0,0,0.12)",
          }}
        >
          {isUnsorted || !editing ? (
            <div className="flex items-center gap-2">
              <span className="text-base md:text-lg">{title}</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-white">{blocks.length}</span>
            </div>
          ) : (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => {
                setEditing(false);
                if (nameDraft.trim().length) onRename?.(nameDraft.trim());
                else setNameDraft(title);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setNameDraft(title);
                  setEditing(false);
                }
              }}
              className="w-full rounded-md border border-white/20 bg-white/10 px-2 py-1 text-sm text-white focus:outline-none"
            />
          )}

          <div className="flex items-center gap-2">
            {!isUnsorted && (
              <>
                <button
                  onClick={() => setEditing((v) => !v)}
                  className="rounded-md bg-white/70 px-2 py-1 text-xs font-semibold text-[#4a2c2a] hover:bg-white"
                >
                  {editing ? "Save" : "Rename"}
                </button>
                <button
                  onClick={onRemove}
                  className="rounded-md bg-white/70 px-2 py-1 text-xs font-semibold text-[#4a2c2a] hover:bg-white"
                >
                  Remove
                </button>
              </>
            )}
          </div>
        </div>

        <div
          className={`min-h-[140px] rounded-2xl border bg/[rgb(244,236,224)] p-3 backdrop-blur-sm border-black/10 bg-[rgb(244,236,224)]/70`}
          style={{ boxShadow: "inset 0 6px 12px rgba(0,0,0,0.06)" }}
        >
          {!isUnsorted && (
            <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-[#3b2c24]">
              <label className="font-semibold">Dots</label>
              <input
                type="number"
                min={0}
                max={10}
                value={dotsValue ?? ""}
                onChange={(e) => onDotsChange?.(catId, Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
                className="w-16 rounded-md border border-black/20 bg-white px-2 py-1 focus:outline-none"
                title="Dot count for this category"
              />
              <label className="font-semibold">Images</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => onUploadChange?.(catId, Array.from(e.target.files || []))}
                className="text-xs"
                title="Bulk upload images for this category"
              />
              <span className="rounded bg-white/60 px-2 py-0.5 font-semibold text-[#4a2c2a]">{filesSummary(uploads[catId])}</span>
              {colorMode === "color" && bgStyle === "per-category" && (
                <>
                  <label className="font-semibold">BG</label>
                  <input
                    type="color"
                    value={bgValue || "#ffffff"}
                    onChange={(e) => onBgChange?.(catId, e.target.value)}
                    title="Background color for this category"
                  />
                </>
              )}
            </div>
          )}
          {!isUnsorted && (
            <div className="mb-2 text-[11px] text-[#3b2c24]">
              {(() => {
                const expected = expectedNamesForCategory({ blocks, name: title });
                const have = (uploads[catId] || []).length;
                const missing = Math.max(0, expected.length - have);
                if (expected.length === 0) return <span className="opacity-70">No blocks in this category.</span>;
                return (
                  <div className="flex flex-col gap-1">
                    <div>
                      Expected images: <b>{expected.length}</b> • Uploaded: <b>{have}</b> • Missing: <b className={missing>0?"text-red-700":""}>{missing}</b>
                    </div>
                    <details>
                      <summary className="cursor-pointer select-none">Show expected file names</summary>
                      <div className="mt-1 rounded bg-white/70 p-2 text-[10px] text-[#2d1c1a]">
                        {expected.join(', ')}
                      </div>
                    </details>
                  </div>
                );
              })()}
            </div>
          )}
          <div className={fullWidth ? "flex flex-wrap gap-3" : "flex flex-col gap-3"}>
            {blocks.length === 0 && (
              <div className="rounded-lg border border-dashed border-black/20 p-5 text-center text-sm text-black/60 w-full">
                Click a block to move or edit it
              </div>
            )}
            {blocks.map((b) => (
              <div key={b.id} className={fullWidth ? "min-w-[220px] flex-1" : undefined}>
                <Block block={b} from={catId} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function normalizeCatName(name) {
    return (name || "").toLowerCase().trim().replace(/[\s_-]+/g, "");
  }

  // Simple fetch wrapper with timeout to prevent infinite spinners
  async function fetchWithTimeout(url, opts = {}, timeoutMs = 180000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: controller.signal });
      return res;
    } finally {
      clearTimeout(id);
    }
  }

  // Build blocks json shape
  function buildBlocksJson() {
    const out = {};
    categories.forEach((c) => {
      out[c.name] = c.blocks.map((b) => b.text);
    });
    return out;
  }
  // Expected names helpers
  function expectedNamesForCategory(cat) {
    const counts = {};
    const out = [];
    const sanitize = (s) => (s || "").trim().split(/\s+/)[0]?.replace(/[^A-Za-z0-9]+/g, "").toLowerCase() || "";
    (cat.blocks || []).forEach((b) => {
      const s = (b.text || "").trim();
      const m = /^\*([^*]+)\*\s*(.*)$/.exec(s);
      let title;
      if (m) {
        title = (m[1] || "").trim();
      } else {
        title = s.split(/\s+/)[0] || "";
      }
      const base = sanitize(title);
      const cur = (counts[base] || 0) + 1;
      counts[base] = cur;
      out.push(cur === 1 ? `${base}.png` : `${base}${cur}.png`);
    });
    return out;
  }
  const filesSummary = (files) => {
    const n = (files || []).length;
    if (!n) return "No files";
    if (n === 1) return "1 file";
    return `${n} files`;
  };

  async function handleGenerate() {
    try {
      setIsGenerating(true);
      setZipUrl("");

      const blocksJson = buildBlocksJson();
      // Dots mapping: category name -> number (fallback to defaults by Python if not set)
      const dotsByName = {};
      categories.forEach((c) => {
        if (catDots[c.id] != null && catDots[c.id] !== "") dotsByName[c.name] = catDots[c.id];
      });

      const conf = { blocks: blocksJson, params, dots: dotsByName };
      if (colorMode === "color") {
        const color = { mode: "color", title: titleColor, subtitle: subtitleColor, background: { style: bgStyle } };
        if (dotColor) color.dot = dotColor;
        if (bgStyle === "solid") {
          color.background.solid = bgSolid;
        } else if (bgStyle === "per-category") {
          const per = {};
          categories.forEach((c) => {
            const hex = bgPerCat[c.id];
            if (hex) per[c.name] = hex;
          });
          color.background.perCategory = per;
          color.background.solid = bgSolid;
        } else if (bgStyle === "gradient") {
          color.background.gradient = [bgGradStart, bgGradEnd];
        }
        conf.color = color;
      } else {
        conf.color = { mode: "bw" };
      }
      const fd = new FormData();
      fd.append("config", JSON.stringify(conf));
      if (titleFont) fd.append("titleFont", titleFont, titleFont.name || "title.ttf");
      if (subtitleFont) fd.append("subtitleFont", subtitleFont, subtitleFont.name || "subtitle.ttf");

      // Attach category images
      categories.forEach((c) => {
        const files = uploads[c.id] || [];
        if (!files.length) return;
        const field = `images_${normalizeCatName(c.name)}`;
        files.forEach((f) => fd.append(field, f, f.name));
      });

      const res = await fetchWithTimeout("/api/generate", { method: "POST", body: fd }, 180000);
      if (!res.ok) {
        let err = `Generation failed (${res.status})`;
        try {
          const j = await res.json();
          if (j?.error) err = j.error;
        } catch {}
        alert(err);
        return;
      }
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/zip")) {
        try {
          const j = await res.json();
          alert(j?.error || "Unexpected response from server.");
          return;
        } catch {}
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setZipUrl(url);
      // auto download
      const a = document.createElement("a");
      a.href = url;
      a.download = "jenga-output.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error(e);
      if (e && e.name === 'AbortError') {
        alert('Request timed out. The API may not be reachable. Please try again or check deployment logs.');
      } else {
        alert("Error generating images. See console for details.");
      }
    } finally {
      setIsGenerating(false);
    }
  }

  // Category picker + inline text editor popover
  function MovePicker() {
    if (!picker) return null;

    const originalText = getBlockText(picker.blockId, picker.from);
    const [draftText, setDraftText] = useState(originalText);

    useEffect(() => {
      setDraftText(originalText);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [picker.blockId, picker.from]);

    // Build destination list
    let destinations = categories.map((c) => ({ id: c.id, name: c.name }));
    if (picker.from !== "unsorted") {
      destinations = [
        { id: "unsorted", name: "Unsorted (remove from category)" },
        ...destinations.filter((d) => d.id !== picker.from),
      ];
    }

    const WIDTH = 320;
    const left = Math.min(picker.x, (typeof window !== "undefined" ? window.innerWidth : WIDTH) - WIDTH - 8);
    const top = Math.min(picker.y, (typeof window !== "undefined" ? window.innerHeight : 400) - 16);

    const canSave = draftText.trim().length > 0 && draftText !== originalText;

    return (
      <div className="fixed inset-0 z-50">
        {/* click-away */}
        <div className="absolute inset-0" onMouseDown={closePicker} />

        <div
          className="absolute rounded-xl border bg-white text-[#3b2c24] shadow-2xl w-[320px] max-h-[75vh] overflow-auto"
          style={{ left, top }}
          role="dialog"
          aria-label="Edit and move block"
        >
          <div className="sticky top-0 flex items-center justify-between border-b bg-white px-3 py-2">
            <div className="font-semibold text-sm">Edit & move</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDraftText(originalText)}
                className="rounded-md px-2 py-1 text-xs font-semibold text-[#4a2c2a] hover:bg-amber-50"
                title="Reset text"
              >
                Reset
              </button>
              <button onClick={closePicker} className="rounded-md px-2 py-1 text-xs font-semibold text-[#4a2c2a] hover:bg-amber-50">Cancel</button>
            </div>
          </div>

          <div className="p-3 border-b">
            <label className="mb-1 block text-xs font-semibold text-black/70">Block text</label>
            <input
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && canSave) {
                  saveBlockText({ blockId: picker.blockId, from: picker.from, newText: draftText });
                }
              }}
              className="w-full rounded-md border border-black/20 bg-white px-2 py-1.5 text-sm text-[#3b2c24] focus:outline-none"
              placeholder="Edit block text"
            />
            <div className="mt-2">
              <button
                disabled={!canSave}
                onClick={() => saveBlockText({ blockId: picker.blockId, from: picker.from, newText: draftText })}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold shadow ${
                  canSave ? "bg-amber-600 text-white hover:bg-amber-700" : "bg-black/10 text-black/40 cursor-not-allowed"
                }`}
              >
                Save text
              </button>
            </div>
          </div>

          <div className="p-2">
            <div className="px-2 pb-2 text-xs font-semibold text-black/60">Move to…</div>
            <ul className="">
              {destinations.length === 0 && (
                <li className="px-3 py-2 text-sm text-black/60">No categories yet. Add one first.</li>
              )}
              {destinations.map((d) => (
                <li key={d.id}>
                  <button
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-amber-50"
                    onClick={() => {
                      const trimmed = draftText.trim();
                      moveBlock({ blockId: picker.blockId, from: picker.from, to: d.id, newText: trimmed });
                      closePicker();
                    }}
                  >
                    <span>{d.name}</span>
                    <span className="text-xs text-black/40">{d.id === "unsorted" ? "remove" : "move"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] p-4 md:p-6 text-white">
      {/* Header */}
      <div className="mb-6 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Jenga Configurator</h1>
          <p className="text-sm text-white/80">Paste your block texts, add categories, then <span className="font-semibold">click a block</span> to edit or choose a destination. Export and import as JSON anytime. Upload fonts and images, then generate a ZIP.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`rounded-xl px-4 py-2 text-sm font-semibold shadow ${isGenerating ? "bg-black/30 text-white/70 cursor-wait" : "bg-amber-600 text-white hover:bg-amber-700"}`}
          >
            {isGenerating ? (
              <span className="inline-flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
                  <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" fill="none" />
                </svg>
                Generating…
              </span>
            ) : (
              "Generate Images"
            )}
          </button>
          {zipUrl && (
            <a href={zipUrl} download="jenga-output.zip" className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-[#4a2c2a] shadow hover:bg-amber-50">Download ZIP</a>
          )}
          <span className={`ml-2 inline-flex items-center gap-1 rounded-xl px-2 py-1 text-xs ${apiAlive===null?"bg-white/30 text-white/80":apiAlive?"bg-green-500/20 text-green-200":"bg-red-500/20 text-red-200"}`} title="API status">
            <span className={`h-2 w-2 rounded-full ${apiAlive?"bg-green-400":"bg-red-400"}`} />
            <span>{apiAlive===null?"Checking API…":apiAlive?"API Live":"API Down"}</span>
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-semibold text-white">Comma-separated block texts</label>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder="e.g. Take a sip, Do 10 pushups, Tell a joke, Swap seats, Sing a song"
            className="h-28 w-full rounded-xl border border-white/20 bg-white/10 p-3 text-sm text-white shadow focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <button onClick={addBlocksFromCsv} className="rounded-xl bg-amber-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-amber-700">Add Blocks</button>
            <button onClick={() => setCsv("")} className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-[#4a2c2a] shadow hover:bg-amber-50">Clear</button>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-white">Add a category</label>
          <div className="flex gap-2">
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addCategory();
              }}
              placeholder="e.g. Easy, Dares, Trivia"
              className="w-full rounded-xl border border-white/20 bg-white/10 p-2 text-sm text-white shadow focus:outline-none"
            />
            <button onClick={addCategory} className="shrink-0 rounded-xl bg-amber-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-amber-700">Add</button>
          </div>
        </div>
      </div>

      {/* Fonts + Advanced params */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="col-span-1">
          <label className="mb-2 block text-sm font-semibold text-white">Title font (optional .ttf/.otf)</label>
          <input type="file" accept=".ttf,.otf" onChange={(e) => setTitleFont((e.target.files||[])[0] || null)} className="w-full rounded-xl border border-white/20 bg-white/10 p-2 text-sm text-white" />
        </div>
        <div className="col-span-1">
          <label className="mb-2 block text-sm font-semibold text-white">Subtitle font (optional .ttf/.otf)</label>
          <input type="file" accept=".ttf,.otf" onChange={(e) => setSubtitleFont((e.target.files||[])[0] || null)} className="w-full rounded-xl border border-white/20 bg-white/10 p-2 text-sm text-white" />
        </div>
        <div className="col-span-1">
          <button onClick={() => setAdvancedOpen((v) => !v)} className="mt-7 rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-[#4a2c2a] shadow hover:bg-amber-200">
            {advancedOpen ? "Hide" : "Show"} Advanced Settings
          </button>
        </div>
      </div>
      {/* Dots toggle (global) */}
      <div className="mb-6 text-white text-sm flex items-center gap-3">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={!!params.show_dots} onChange={(e) => setParams((p) => ({ ...p, show_dots: e.target.checked }))} />
          <span>Show dots</span>
        </label>
        {colorMode === "color" && (
          <>
            <span className="opacity-70">•</span>
            <label className="flex items-center gap-2">
              <span>Dot color</span>
              <input type="color" value={dotColor} onChange={(e) => setDotColor(e.target.value)} />
            </label>
          </>
        )}
      </div>
      {/* Upload size hint */}
      {totalUploadBytes > 0 && (
        <div className="mb-6 text-xs text-white/80">
          Upload size: {(totalUploadBytes/1024/1024).toFixed(2)} MB{totalUploadBytes > 4.2*1024*1024 ? " • This may exceed serverless limits; try fewer/smaller images." : ""}
        </div>
      )}
      {/* Color Mode */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="col-span-1 text-white">
          <label className="mb-2 block text-sm font-semibold">Color mode</label>
          <div className="flex items-center gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="colormode" value="bw" checked={colorMode === "bw"} onChange={() => setColorMode("bw")} />
              <span>Black & White</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="colormode" value="color" checked={colorMode === "color"} onChange={() => setColorMode("color")} />
              <span>Color</span>
            </label>
          </div>
        </div>
        {colorMode === "color" && (
          <>
            <div className="col-span-1 text-white">
              <label className="mb-2 block text-sm font-semibold">Title color</label>
              <input type="color" value={titleColor} onChange={(e) => setTitleColor(e.target.value)} />
            </div>
            <div className="col-span-1 text-white">
              <label className="mb-2 block text-sm font-semibold">Subtitle color</label>
              <input type="color" value={subtitleColor} onChange={(e) => setSubtitleColor(e.target.value)} />
            </div>
          </>
        )}
      </div>
      {colorMode === "color" && (
        <div className="mb-6 grid grid-cols-1 gap-4 text-white">
          <div>
            <label className="mb-2 block text-sm font-semibold">Background style</label>
            <div className="flex items-center gap-4 text-sm">
              {[
                ["solid", "Solid"],
                ["per-category", "Per category"],
                ["gradient", "Gradient"],
              ].map(([val, label]) => (
                <label key={val} className="inline-flex items-center gap-2">
                  <input type="radio" name="bgstyle" value={val} checked={bgStyle === val} onChange={() => setBgStyle(val)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
          {bgStyle === "solid" && (
            <div>
              <label className="mb-2 block text-sm font-semibold">Background color</label>
              <input type="color" value={bgSolid} onChange={(e) => setBgSolid(e.target.value)} />
            </div>
          )}
          {bgStyle === "gradient" && (
            <div className="flex items-center gap-4">
              <div>
                <label className="mb-2 block text-sm font-semibold">Start</label>
                <input type="color" value={bgGradStart} onChange={(e) => setBgGradStart(e.target.value)} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">End</label>
                <input type="color" value={bgGradEnd} onChange={(e) => setBgGradEnd(e.target.value)} />
              </div>
            </div>
          )}
        </div>
      )}
      {advancedOpen && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4 text-[#3b2c24]">
          {[
            ["bed_w","Bed width (mm)"], ["bed_h","Bed height (mm)"], ["block_w","Block width (mm)"], ["block_h","Block height (mm)"],
            ["spacing","Block spacing (mm)"], ["page_margin","Page margin (mm)"], ["raster_margin","Inner margin (mm)"], ["template_tol","Template tolerance (mm)"],
            ["title_mm","Title font size (mm)"], ["title_sub_gap_mm","Title–subtitle gap (mm)"], ["dot_mm","Dot diameter (mm)"], ["dot_gap_mm","Dot gap (mm)"],
            ["dot_vgap_mm","Dot vertical gap (mm)"], ["icon_ratio","Icon width ratio (≤0.20)"], ["text_icon_gap_mm","Text–icon gap (mm)"], ["line_height","Subtitle line-height"],
            ["preview_dpi","Preview DPI"], ["icon_white_threshold","Icon white→transparent threshold (0–255)"],
          ].map(([key,label]) => (
            <div key={key} className="flex flex-col">
              <label className="mb-1 block text-xs font-semibold text-white">{label}</label>
              <input
                value={params[key]}
                onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))}
                className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-sm text-white focus:outline-none"
              />
            </div>
          ))}
        </div>
      )}

      {/* JSON copy/paste */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-semibold text-white">Paste JSON to load</label>
          <textarea
            value={jsonPaste}
            onChange={(e) => setJsonPaste(e.target.value)}
            placeholder='{"Category A": ["Take a sip", "Tell a joke"], "Category B": ["..."]}'
            className="h-48 w-full rounded-xl border border-white/20 bg-white/10 p-3 text-sm text-white shadow focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <button onClick={loadFromJsonText} className="rounded-xl bg-amber-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-amber-700">Load from JSON</button>
            <button onClick={() => setJsonPaste("")} className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-[#4a2c2a] shadow hover:bg-amber-50">Clear</button>
          </div>
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold text-white">Current categories JSON (copy)</label>
          <textarea
            value={exportText}
            readOnly
            className="h-48 w-full rounded-xl border border-white/20 bg-white/10 p-3 text-sm text-white shadow focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <button onClick={copyExport} className="rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-[#4a2c2a] shadow hover:bg-amber-200">Copy</button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-2xl p-4" style={woodTextureStyle(1)}>
          <div className="text-sm text-white/80">Unsorted</div>
          <div className="text-2xl font-extrabold text-white">{stats.unsorted}</div>
        </div>
        <div className="rounded-2xl p-4" style={woodTextureStyle(2)}>
          <div className="text-sm text-white/80">Sorted</div>
          <div className="text-2xl font-extrabold text-white">{stats.sorted}</div>
        </div>
        <div className="rounded-2xl p-4" style={woodTextureStyle(3)}>
          <div className="text-sm text-white/80">Total Blocks</div>
          <div className="text-2xl font-extrabold text-white">{stats.total}</div>
        </div>
      </div>

      {/* Unsorted full-width above categories */}
      <div className="mb-6">
        <Column fullWidth title="Unsorted" catId="unsorted" blocks={unsorted} />
      </div>

      {/* Board (categories row) */}
      <div className="flex gap-4 overflow-x-auto pb-8">
        {/* Category Columns */}
        {categories.map((c) => (
          <Column
            key={c.id}
            title={c.name}
            catId={c.id}
            blocks={c.blocks}
            onRename={(name) => renameCategory(c.id, name)}
            onRemove={() => removeCategory(c.id)}
            dotsValue={catDots[c.id] ?? ""}
            onDotsChange={(id, v) => setCatDots((d) => ({ ...d, [id]: v }))}
            onUploadChange={(id, files) => setUploads((u) => ({ ...u, [id]: files }))}
            bgValue={bgPerCat[c.id]}
            onBgChange={(id, hex) => setBgPerCat((m) => ({ ...m, [id]: hex }))}
          />
        ))}
      </div>

      {/* Picker overlay */}
      <MovePicker />

      {/* Footer note */}
      <div className="mt-6 text-center text-xs text-white/60">Click-to-move uses a lightweight popover with inline text editing. Export includes only category assignments (not Unsorted).</div>
    </div>
  );
}

// Expose to window for index.html to render without a bundler
if (typeof window !== "undefined") {
  window.JengaConfigurator = JengaConfigurator;
}
