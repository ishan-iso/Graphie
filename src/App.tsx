import { useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, FilePlus2, FolderOpen, Image as ImageIcon, LayoutDashboard, LineChart, MousePointer2, PenLine, RectangleHorizontal, Redo2, Save, Settings2, SlidersHorizontal, Square, Type, Undo2 } from 'lucide-react';

type Tool = 'select' | 'pen' | 'eraser' | 'text' | 'line' | 'rect' | 'ellipse';
type Point = { x: number; y: number };
type StrokeObject = {
  id: string;
  kind: 'stroke';
  points: Point[];
  color: string;
  width: number;
  straight?: boolean;
};

type TextObject = {
  id: string;
  kind: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
};

type ShapeObject = {
  id: string;
  kind: 'rect' | 'ellipse' | 'line' | 'arrow';
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  fill: string;
};

type CanvasObject = StrokeObject | TextObject | ShapeObject;

type Viewport = {
  x: number;
  y: number;
  scale: number;
};

type DragState = {
  mode: 'pan' | 'draw' | 'shape' | 'erase' | 'select' | null;
  pointerId: number | null;
  start: Point;
  current: Point;
  objectId?: string;
  straight?: boolean;
};

type BatteryManagerLike = {
  level: number;
  charging: boolean;
  addEventListener: (type: 'levelchange' | 'chargingchange', listener: () => void) => void;
  removeEventListener: (type: 'levelchange' | 'chargingchange', listener: () => void) => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const initialViewport: Viewport = { x: 300, y: 220, scale: 1 };
const canvasSize = { width: 1600, height: 960 };
const lightCanvas = '#f7f9fc';

const worldToScreen = (point: Point, viewport: Viewport) => ({
  x: point.x * viewport.scale + viewport.x,
  y: point.y * viewport.scale + viewport.y,
});

const screenToWorld = (point: Point, viewport: Viewport) => ({
  x: (point.x - viewport.x) / viewport.scale,
  y: (point.y - viewport.y) / viewport.scale,
});

const clientToCanvas = (clientX: number, clientY: number, rect: DOMRect): Point => ({
  x: ((clientX - rect.left) / rect.width) * canvasSize.width,
  y: ((clientY - rect.top) / rect.height) * canvasSize.height,
});

const parseGraphieDocument = (json: string) => {
  const parsed = JSON.parse(json);
  return {
    objects: parsed.objects ?? [],
    viewport: parsed.viewport ?? initialViewport,
    name: parsed.metadata?.name ?? 'Untitled',
  };
};
const createDocumentBlob = (objects: CanvasObject[], viewport: Viewport, name: string) => {
  const payload = {
    format: 'graphie',
    version: 1,
    metadata: {
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    viewport,
    objects,
  };

  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
};

const shapeFromDrag = (drag: DragState, start: Point, current: Point, id: string): ShapeObject => {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);

  return {
    id,
    kind: drag.mode === 'shape' ? 'rect' : 'rect',
    x,
    y,
    width,
    height,
    stroke: '#dfe7ea',
    fill: 'rgba(162, 202, 255, 0.08)',
  };
};

const App = () => {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const panPointRef = useRef<Point | null>(null);
  const historyRef = useRef<CanvasObject[][]>([]);
  const redoHistoryRef = useRef<CanvasObject[][]>([]);
  const previousObjectsRef = useRef<CanvasObject[] | null>(null);
  const skipHistoryRef = useRef(false);
  const gestureHistoryRef = useRef<CanvasObject[] | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [viewport, setViewport] = useState<Viewport>(initialViewport);
  const [documentName, setDocumentName] = useState('Untitled');
  const [objects, setObjects] = useState<CanvasObject[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [status, setStatus] = useState('Ready');
  const [draft, setDraft] = useState<ShapeObject | null>(null);
  const [penColor, setPenColor] = useState('#101116');
  const [penWidth, setPenWidth] = useState(3);
  const [shapeColor, setShapeColor] = useState('#496a96');
  const [shapeFill, setShapeFill] = useState('#dbeafe');
  const [isRenaming, setIsRenaming] = useState(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [showDashboard, setShowDashboard] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [widthMenuOpen, setWidthMenuOpen] = useState(false);
  const [widthMenuHoverOpen, setWidthMenuHoverOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [batteryLevel, setBatteryLevel] = useState(0.01);
  const [isCharging, setIsCharging] = useState(false);
  const [drag, setDrag] = useState<DragState>({ mode: null, pointerId: null, start: { x: 0, y: 0 }, current: { x: 0, y: 0 } });

  useEffect(() => {
    const clock = window.setInterval(() => setCurrentDate(new Date()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    const getBattery = (navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> }).getBattery;
    if (!getBattery) return;

    let battery: BatteryManagerLike | null = null;
    const updateBattery = () => {
      if (!battery) return;
      setBatteryLevel(battery.level);
      setIsCharging(battery.charging);
    };

    void getBattery.call(navigator).then((result) => {
      battery = result;
      updateBattery();
      battery.addEventListener('levelchange', updateBattery);
      battery.addEventListener('chargingchange', updateBattery);
    });

    return () => {
      if (battery) {
        battery.removeEventListener('levelchange', updateBattery);
        battery.removeEventListener('chargingchange', updateBattery);
      }
    };
  }, []);

  const dateLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: '2-digit', month: 'short' }).format(currentDate);
  const timeLabel = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(currentDate);

  useEffect(() => {
    const saved = localStorage.getItem('graphie-recovery');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.objects) {
          setObjects(parsed.objects);
          setViewport(parsed.viewport ?? initialViewport);
          setDocumentName(parsed.metadata?.name ?? parsed.documentName ?? 'Untitled');
          setStatus('Recovered autosave');
        }
      } catch {
        // ignore invalid recovery state
      }
    }

  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'v' || event.key === 'V') setTool('select');
      if (event.key === 'p' || event.key === 'P') setTool('pen');
      if (event.key === 't' || event.key === 'T') setTool('text');
      if (event.key === 'e' || event.key === 'E') setTool('eraser');
      if (event.key === 'Escape') {
        setSelectedIds([]);
        setDraft(null);
      }
      if ((event.ctrlKey || event.metaKey) && event.key === '0') {
        event.preventDefault();
        setViewport({ x: 360, y: 220, scale: 1 });
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === '+' || event.key === '=' || event.key === '-')) {
        event.preventDefault();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveDocument();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        fileInputRef.current?.click();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        const previous = historyRef.current.pop();
        if (previous) {
          redoHistoryRef.current = [...redoHistoryRef.current.slice(-49), objects];
          skipHistoryRef.current = true;
          setObjects(previous);
          setSelectedIds([]);
          setStatus('Undid last action');
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        const next = redoHistoryRef.current.pop();
        if (next) {
          historyRef.current = [...historyRef.current.slice(-49), objects];
          skipHistoryRef.current = true;
          setObjects(next);
          setSelectedIds([]);
          setStatus('Redid last action');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [objects, viewport, documentName]);

  useEffect(() => {
    localStorage.setItem('graphie-recovery', JSON.stringify({ objects, viewport, documentName }));
  }, [objects, viewport, documentName]);

  useEffect(() => {
    if (previousObjectsRef.current && !skipHistoryRef.current && !gestureHistoryRef.current && JSON.stringify(previousObjectsRef.current) !== JSON.stringify(objects)) {
      historyRef.current = [...historyRef.current.slice(-49), previousObjectsRef.current];
    }
    previousObjectsRef.current = objects;
    skipHistoryRef.current = false;
  }, [objects]);

  useEffect(() => {
    const preventBrowserZoom = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };
    window.addEventListener('wheel', preventBrowserZoom, { passive: false });
    return () => window.removeEventListener('wheel', preventBrowserZoom);
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);

  const selectedObjects = useMemo(
    () => objects.filter((obj) => selectedIds.includes(obj.id)),
    [objects, selectedIds]
  );

  const saveDocument = () => {
    const blob = createDocumentBlob(objects, viewport, documentName);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${documentName.replace(/\.graphie$/i, '') || 'Untitled'}.graphie`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Saved');
  };

  const openDocument = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '');
        const parsed = parseGraphieDocument(text);
        setObjects(parsed.objects);
        setViewport(parsed.viewport);
        setDocumentName(file.name.replace(/\.graphie$/i, ''));
        setStatus(`Opened ${file.name}`);
        setShowDashboard(false);
      } catch {
        setStatus('Invalid .graphie document');
      }
    };
    reader.readAsText(file);
  };

  const addShapeObject = (type: 'rect' | 'ellipse' | 'line' | 'arrow') => {
    const object: ShapeObject = {
      id: makeId(),
      kind: type,
      x: 80,
      y: 80,
      width: 180,
      height: 120,
      stroke: shapeColor,
      fill: type === 'line' ? 'transparent' : shapeFill,
    };
    setObjects((current) => [...current, object]);
    redoHistoryRef.current = [];
    setSelectedIds([object.id]);
  };


  const addTextAtCenter = () => {
    const textObject: TextObject = {
      id: makeId(),
      kind: 'text',
      x: (canvasSize.width / 2 - viewport.x) / viewport.scale,
      y: (canvasSize.height / 2 - viewport.y) / viewport.scale,
      text: 'Edit selected text',
      fontSize: 20,
    };
    setObjects((current) => [...current, textObject]);
    setSelectedIds([textObject.id]);
    setEditingTextId(textObject.id);
  };

  const addTextAt = (world: Point) => {
    const textObject: TextObject = { id: makeId(), kind: 'text', x: world.x, y: world.y, text: '', fontSize: 20 };
    setObjects((current) => [...current, textObject]);
    setSelectedIds([textObject.id]);
    setEditingTextId(textObject.id);
  };

  const deleteSelection = () => {
    setObjects((current) => current.filter((item) => !selectedIds.includes(item.id)));
    setSelectedIds([]);
  };

  const updateSelectedObject = (updates: Partial<CanvasObject>) => {
    setObjects((current) => current.map((item) => (selectedIds.includes(item.id) ? { ...item, ...updates } as CanvasObject : item)));
  };

  const selectedObject = selectedObjects[0];

  const eraseAt = (world: Point) => {
    const hit = objects.find((obj) => {
      if (obj.kind === 'stroke') {
        const points = obj.straight ? [obj.points[0], obj.points[obj.points.length - 1]] : obj.points;
        return points.some((point) => Math.hypot(point.x - world.x, point.y - world.y) < 18 / viewport.scale);
      }
      if (obj.kind === 'text') return Math.abs(obj.x - world.x) < 80 && Math.abs(obj.y - world.y) < 34;
      return world.x >= obj.x - 18 && world.x <= obj.x + obj.width + 18 && world.y >= obj.y - 18 && world.y <= obj.y + obj.height + 18;
    });
    if (!hit) return;
    setObjects((current) => current.filter((item) => item.id !== hit.id));
    setSelectedIds((current) => current.filter((id) => id !== hit.id));
    setStatus('Erased object');
  };

  const objectBounds = (obj: CanvasObject) => {
    if (obj.kind === 'stroke') {
      const xs = obj.points.map((point) => point.x);
      const ys = obj.points.map((point) => point.y);
      return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
    }
    if (obj.kind === 'text') {
      const width = Math.max(70, obj.text.length * obj.fontSize * 0.55);
      return { left: obj.x - 8, top: obj.y - obj.fontSize - 8, right: obj.x + width + 8, bottom: obj.y + 8 };
    }
    return { left: obj.x, top: obj.y, right: obj.x + obj.width, bottom: obj.y + obj.height };
  };

  const selectInBox = (start: Point, current: Point) => {
    const left = Math.min(start.x, current.x);
    const top = Math.min(start.y, current.y);
    const right = Math.max(start.x, current.x);
    const bottom = Math.max(start.y, current.y);
    setSelectedIds(objects.filter((obj) => {
      const bounds = objectBounds(obj);
      return bounds.right >= left && bounds.left <= right && bounds.bottom >= top && bounds.top <= bottom;
    }).map((obj) => obj.id));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    event.currentTarget.setPointerCapture(event.pointerId);

    const canvasPoint = clientToCanvas(event.clientX, event.clientY, rect);

    if (event.button === 2 || event.button === 1 || (event.button === 0 && event.shiftKey && tool === 'select')) {
      panPointRef.current = canvasPoint;
      setDrag({ mode: 'pan', pointerId: event.pointerId, start: canvasPoint, current: canvasPoint });
      return;
    }

    const world = screenToWorld(canvasPoint, viewport);
    setShowDashboard(false);

    if (tool === 'text' && event.button === 0) {
      addTextAt(world);
      return;
    }

    if (tool === 'eraser') {
      gestureHistoryRef.current = objects;
      eraseAt(world);
      setDrag({ mode: 'erase', pointerId: event.pointerId, start: world, current: world });
      return;
    }

    if (tool === 'pen') {
      const stroke: StrokeObject = {
        id: makeId(),
        kind: 'stroke',
        points: [world],
        color: penColor,
        width: penWidth,
        straight: event.shiftKey,
      };
      gestureHistoryRef.current = objects;
      setObjects((current) => [...current, stroke]);
      setStatus('Drawing');
      setDrag({ mode: 'draw', pointerId: event.pointerId, start: world, current: world, objectId: stroke.id, straight: event.shiftKey });
      return;
    }

    if (tool === 'select') {
      if (event.button === 0) {
        const hit = objects.find((obj) => {
          if (obj.kind === 'stroke') {
            return obj.points.some((point) => Math.hypot(point.x - world.x, point.y - world.y) < 12 / viewport.scale);
          }
          if (obj.kind === 'text') {
            return Math.abs(obj.x - world.x) < 60 && Math.abs(obj.y - world.y) < 30;
          }
          const bounds = objectBounds(obj);
          return world.x >= bounds.left - 12 && world.x <= bounds.right + 12 && world.y >= bounds.top - 12 && world.y <= bounds.bottom + 12;
        });

        if (hit) {
          if (event.shiftKey) {
            setSelectedIds((current) => (current.includes(hit.id) ? current.filter((id) => id !== hit.id) : [...current, hit.id]));
          } else {
            setSelectedIds([hit.id]);
          }
        } else {
          setDrag({ mode: 'select', pointerId: event.pointerId, start: world, current: world });
          setSelectedIds([]);
        }
      }
    }

    if (tool === 'line' || tool === 'rect' || tool === 'ellipse') {
      const start = world;
      setDraft({
        id: makeId(),
        kind: tool === 'line' ? 'line' : tool === 'rect' ? 'rect' : 'ellipse',
        x: start.x,
        y: start.y,
        width: 0,
        height: 0,
        stroke: shapeColor,
        fill: shapeFill,
      });
      setDrag({ mode: 'shape', pointerId: event.pointerId, start, current: start, objectId: undefined });
      return;
    }

  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (drag.mode === 'pan') {
      const currentPoint = clientToCanvas(event.clientX, event.clientY, rect);
      const previousPoint = panPointRef.current ?? currentPoint;
      const dx = currentPoint.x - previousPoint.x;
      const dy = currentPoint.y - previousPoint.y;
      setViewport((current) => ({
        ...current,
        x: current.x + dx,
        y: current.y + dy,
      }));
      panPointRef.current = currentPoint;
      return;
    }

    if (drag.mode === 'draw' && drag.objectId) {
      const world = screenToWorld(clientToCanvas(event.clientX, event.clientY, rect), viewport);
      setObjects((current) =>
        current.map((item) => {
          if (item.id !== drag.objectId || item.kind !== 'stroke') return item;
          return {
            ...item,
            points: drag.straight ? [drag.start, world] : [...item.points, world],
          };
        })
      );
      return;
    }

    if (drag.mode === 'erase') {
      eraseAt(screenToWorld(clientToCanvas(event.clientX, event.clientY, rect), viewport));
      return;
    }

    if (drag.mode === 'shape' && draft) {
      const world = screenToWorld(clientToCanvas(event.clientX, event.clientY, rect), viewport);
      const start = drag.start;
      const next = {
        ...draft,
        x: Math.min(start.x, world.x),
        y: Math.min(start.y, world.y),
        width: Math.abs(world.x - start.x),
        height: Math.abs(world.y - start.y),
      };
      setDraft(next);
    }

    if (drag.mode === 'select') {
      const current = screenToWorld(clientToCanvas(event.clientX, event.clientY, rect), viewport);
      setDrag((state) => ({ ...state, current }));
      selectInBox(drag.start, current);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.mode === 'shape' && draft) {
      setObjects((current) => [...current, draft]);
      setSelectedIds([draft.id]);
      setDraft(null);
    }
    if (drag.mode === 'select') selectInBox(drag.start, drag.current);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (gestureHistoryRef.current) {
      historyRef.current = [...historyRef.current.slice(-49), gestureHistoryRef.current];
      gestureHistoryRef.current = null;
    }
    panPointRef.current = null;
    setDrag({ mode: null, pointerId: null, start: { x: 0, y: 0 }, current: { x: 0, y: 0 } });
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const { x: pointerX, y: pointerY } = clientToCanvas(event.clientX, event.clientY, rect);

    if (event.shiftKey) {
      setViewport((current) => ({ ...current, x: current.x + event.deltaY * 0.9 }));
      return;
    }

    const nextScale = clamp(viewport.scale * (1 - event.deltaY * 0.0012), 0.25, 3.5);
    const worldX = (pointerX - viewport.x) / viewport.scale;
    const worldY = (pointerY - viewport.y) / viewport.scale;

    setViewport({
      x: pointerX - worldX * nextScale,
      y: pointerY - worldY * nextScale,
      scale: nextScale,
    });
  };

  const renderObject = (obj: CanvasObject) => {
    if (obj.kind === 'stroke') {
      const points = obj.points.map((point) => `${point.x},${point.y}`).join(' ');
      const bounds = objectBounds(obj);
      return <g key={obj.id}><polyline points={points} fill="none" stroke={obj.color} strokeWidth={obj.width} strokeLinejoin="round" strokeLinecap="round" />{selectedIds.includes(obj.id) && <rect x={bounds.left - 8} y={bounds.top - 8} width={bounds.right - bounds.left + 16} height={bounds.bottom - bounds.top + 16} fill="none" stroke="#5E2AF3" strokeWidth={2} strokeDasharray="6 4" />}</g>;
    }

    if (obj.kind === 'text') {
      const isSelected = selectedIds.includes(obj.id);
      return (
        <g key={obj.id} transform={`translate(${obj.x} ${obj.y})`}>
          <text x={0} y={0} fontSize={obj.fontSize} fill="#1e293b" style={{ userSelect: 'none' }} onDoubleClick={() => setEditingTextId(obj.id)}>
            {obj.text}
          </text>
          {isSelected && <rect x={-8} y={-obj.fontSize} width={obj.text.length * 10 + 20} height={obj.fontSize + 14} fill="none" stroke="#5E2AF3" strokeDasharray="6 4" />}
        </g>
      );
    }

    if (obj.kind === 'line') {
      const isSelected = selectedIds.includes(obj.id);
      return (
        <g key={obj.id}>
          <line x1={obj.x} y1={obj.y} x2={obj.x + obj.width} y2={obj.y + obj.height} stroke={obj.stroke} strokeWidth={1.5} />
          {isSelected && <rect x={obj.x - 7} y={obj.y - 7} width={obj.width + 14} height={obj.height + 14} fill="none" stroke="#5E2AF3" strokeDasharray="6 4" />}
        </g>
      );
    }

    const isSelected = selectedIds.includes(obj.id);
    return (
      <g key={obj.id}>
        {obj.kind === 'rect' ? (
          <rect x={obj.x} y={obj.y} width={obj.width} height={obj.height} fill={obj.fill} stroke={obj.stroke} strokeWidth={1.5} />
        ) : (
          <ellipse cx={obj.x + obj.width / 2} cy={obj.y + obj.height / 2} rx={obj.width / 2} ry={obj.height / 2} fill={obj.fill} stroke={obj.stroke} strokeWidth={1.5} />
        )}
        {isSelected && <rect x={obj.x - 7} y={obj.y - 7} width={obj.width + 14} height={obj.height + 14} fill="none" stroke="#5E2AF3" strokeDasharray="6 4" />}
      </g>
    );
  };

  const exportSvg = () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
        <rect width="100%" height="100%" fill="${lightCanvas}"/>
        ${objects
          .map((obj) => {
            if (obj.kind === 'stroke') {
              const points = obj.points.map((point) => `${point.x * 2 + 800},${point.y * 2 + 500}`).join(' ');
              return `<polyline points="${points}" fill="none" stroke="#334155" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
            }
            if (obj.kind === 'text') {
              return `<text x="${obj.x * 2 + 800}" y="${obj.y * 2 + 500}" font-size="${obj.fontSize}" fill="#1e293b">${obj.text}</text>`;
            }
            if (obj.kind === 'line') {
              return `<line x1="${obj.x * 2 + 800}" y1="${obj.y * 2 + 500}" x2="${obj.x * 2 + 800 + obj.width * 2}" y2="${obj.y * 2 + 500 + obj.height * 2}" stroke="#496a96" stroke-width="1.5"/>`;
            }
            if (obj.kind === 'rect') {
              return `<rect x="${obj.x * 2 + 800}" y="${obj.y * 2 + 500}" width="${obj.width * 2}" height="${obj.height * 2}" fill="#dbeafe" stroke="#496a96" stroke-width="1.5"/>`;
            }
            return `<ellipse cx="${obj.x * 2 + 800}" cy="${obj.y * 2 + 500}" rx="${(obj.width * 2) / 2}" ry="${(obj.height * 2) / 2}" fill="#dbeafe" stroke="#496a96" stroke-width="1.5"/>`;
          })
          .join('')}
      </svg>
    `;

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'graphie-export.svg';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('SVG exported');
  };

  const exportPng = async () => {
    const svgString = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
        <rect width="100%" height="100%" fill="${lightCanvas}"/>
        ${objects
          .map((obj) => {
            if (obj.kind === 'stroke') {
              const points = obj.points.map((point) => `${point.x * 2 + 800},${point.y * 2 + 500}`).join(' ');
              return `<polyline points="${points}" fill="none" stroke="#334155" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
            }
            return '';
          })
          .join('')}
      </svg>
    `;

    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement>((resolve) => {
      const image = new window.Image();
      image.onload = () => resolve(image);
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1000;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#111317';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0);
    }

    const pngUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = 'graphie-export.png';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('PNG exported');
  };

  const exportPdf = () => {
    const lines = objects.map((obj) => {
      if (obj.kind === 'text') return obj.text;
      return 'Shape';
    });

    const pdfContent = lines.length > 0 ? lines.join('\n') : 'Graphie workspace';
    const blob = new Blob([pdfContent], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'graphie-export.pdf';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('PDF exported');
  };

  return (
    <div className={`app-shell ${showDashboard ? 'dashboard-open' : ''}`}>
      <input ref={fileInputRef} type="file" accept=".graphie,.json,application/json" className="hidden-input" onChange={(event) => { if (event.target.files?.[0]) openDocument(event.target.files[0]); event.currentTarget.value = ''; }} />

      <header className="topbar">
        {!showDashboard && <div className="title-block">
          <div>
            <div className="app-name">GRAPHIE</div>
            {isRenaming ? (
              <input
                className="document-name-input"
                autoFocus
                value={documentName}
                onChange={(event) => setDocumentName(event.target.value)}
                onBlur={() => setIsRenaming(false)}
                onKeyDown={(event) => event.key === 'Enter' && setIsRenaming(false)}
                aria-label="Board name"
              />
            ) : (
              <button className="document-name" title="Rename board" onClick={() => setIsRenaming(true)}>{documentName} {status.includes('Saved') || status.includes('Opened') ? '' : '*'}</button>
            )}
          </div>
        </div>}

        <div className="top-status" aria-label="Workspace status">
          <span>{dateLabel}</span>
          <strong>{timeLabel}</strong>
        </div>

        <div className="top-right-controls">
          <div className="settings-control">
            <button className={`status-icon-button ${settingsOpen ? 'is-open' : ''}`} title="Settings" onClick={() => setSettingsOpen((open) => !open)}><Settings2 size={15} /></button>
            {settingsOpen && <div className="settings-popover" onPointerDown={(event) => event.stopPropagation()}>
              <nav className="file-menu">
                <button title="Dashboard" onClick={() => { setShowDashboard(true); setSettingsOpen(false); }}><LayoutDashboard size={16} /><span>Dashboard</span></button>
                <button title="New document" onClick={() => { setObjects([]); setSelectedIds([]); setDocumentName('Untitled'); setStatus('New document'); setSettingsOpen(false); }}><FilePlus2 size={16} /><span>New</span></button>
                <button title="Open document" onClick={() => fileInputRef.current?.click()}><FolderOpen size={16} /><span>Open</span></button>
                <button className="primary-action" title="Save document" onClick={saveDocument}><Save size={16} /><span>Save</span></button>
                <button title="Export SVG" onClick={exportSvg}><LineChart size={16} /><span>SVG</span></button>
                <button title="Export PNG" onClick={() => void exportPng()}><ImageIcon size={16} /><span>PNG</span></button>
                <button title="Export PDF" onClick={exportPdf}><FilePlus2 size={16} /><span>PDF</span></button>
              </nav>
            </div>}
          </div>
          <div className={`battery-display ${batteryLevel < 0.2 ? 'battery-critical' : batteryLevel < 0.4 ? 'battery-low' : ''}`} title={`${Math.round(batteryLevel * 100)}%${isCharging ? ' charging' : ''}`}>
            <span className="battery-icon" aria-hidden="true"><span style={{ width: `${Math.max(4, batteryLevel * 100)}%` }} /></span>
            <span className="battery-value">{Math.round(batteryLevel * 100)}%</span>
          </div>
        </div>
      </header>

      <div className="workspace">
        {showDashboard && <section className="dashboard-screen">
          <div className="dashboard-brand"><span>GRAPHIE</span></div>
          <div className="dashboard-main">
            <div className="dashboard-copy"><h1>HI<br />THERE!</h1></div>
            <div className="dashboard-stroke" aria-hidden="true"><span /></div>
          </div>
          <div className="dashboard-bottom">
            <div className="dashboard-grid">
              <button className="dashboard-card dashboard-card-primary" onClick={() => { setObjects([]); setSelectedIds([]); setDocumentName('Untitled'); setShowDashboard(false); }}><FilePlus2 size={22} /><strong>New board</strong><span>Start with a clean canvas</span></button>
              <button className="dashboard-card" onClick={() => fileInputRef.current?.click()}><FolderOpen size={22} /><strong>Open board</strong><span>Continue from a .graphie file</span></button>
            </div>
          </div>
        </section>}
        <main className="canvas-panel">
          <div
            ref={canvasRef}
            className="canvas-surface"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onContextMenu={(event) => event.preventDefault()}
            onWheel={handleWheel}
          >
            <svg viewBox="0 0 1600 960" preserveAspectRatio="none" width="100%" height="100%">
              <defs>
                <pattern id="canvas-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <circle cx="2" cy="2" r="1.1" fill="#b9b8d3" fillOpacity=".38" />
                </pattern>
              </defs>
              <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
                <rect x={-1000000} y={-1000000} width={2000000} height={2000000} fill="transparent" />
                <rect x={-1000000} y={-1000000} width={2000000} height={2000000} fill="url(#canvas-grid)" />
                <g>{objects.map(renderObject)}</g>
                {draft && renderObject(draft)}
                {drag.mode === 'select' && <rect x={Math.min(drag.start.x, drag.current.x)} y={Math.min(drag.start.y, drag.current.y)} width={Math.abs(drag.current.x - drag.start.x)} height={Math.abs(drag.current.y - drag.start.y)} fill="#5E2AF3" fillOpacity="0.14" stroke="#5E2AF3" strokeWidth={1.5} strokeDasharray="5 3" />}
              </g>
            </svg>

            {!objects.length && <div className="canvas-hint">Pick a tool below to begin</div>}

            <div className="toolbar floating-toolbar reference-toolbar" aria-label="Canvas tools" onPointerDown={(event) => event.stopPropagation()}>
              <button title="Undo (Ctrl+Z)" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))}><Undo2 size={21} /><span>Undo</span></button>
              <button title="Redo (Ctrl+Y)" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }))}><Redo2 size={21} /><span>Redo</span></button>
              <span className="toolbar-divider" />
              <button title="Select (V)" className={`reference-tool select-tool ${tool === 'select' ? 'active' : ''}`} onClick={() => { setTool('select'); setWidthMenuOpen(false); }}><MousePointer2 size={24} /><span>Select</span></button>
              <button title="Pen (P)" className={`reference-tool pen-tool ${tool === 'pen' ? 'active' : ''}`} onClick={() => { setTool('pen'); setWidthMenuOpen(false); }}><PenLine size={26} /><span>Pen</span></button>
              <div className="width-tool-wrap" onMouseEnter={() => setWidthMenuHoverOpen(true)} onMouseLeave={() => setWidthMenuHoverOpen(false)}>
                <button title="Pen width" className={`reference-tool width-tool ${widthMenuOpen || widthMenuHoverOpen ? 'active' : ''}`} onClick={() => setWidthMenuOpen((open) => !open)}><SlidersHorizontal size={24} /><span>{penWidth}px</span></button>
                {(widthMenuOpen || widthMenuHoverOpen) && <div className="width-picker" onPointerDown={(event) => event.stopPropagation()}>
                  {[3, 5, 8, 12].map((width) => <button key={width} className={penWidth === width ? 'active' : ''} onClick={() => { setPenWidth(width); setTool('pen'); setWidthMenuOpen(false); }}><span style={{ width: `${Math.min(18, width + 2)}px`, height: `${Math.min(18, width + 2)}px` }} />{width}</button>)}
                </div>}
              </div>
              <button title="Eraser (E)" className={`reference-tool eraser-tool ${tool === 'eraser' ? 'active' : ''}`} onClick={() => { setTool('eraser'); setWidthMenuOpen(false); }}><Eraser size={26} /><span>Eraser</span></button>
              <span className="toolbar-divider" />
              <div className="toolbar-color-swatches" aria-label="Ink colors">
                {['#101116', '#ef6b73', '#6888ff', '#b8e986'].map((color) => (
                  <button key={color} className={`color-swatch ${penColor === color ? 'active' : ''}`} title={`Use ${color}`} style={{ backgroundColor: color }} onClick={() => { setPenColor(color); setTool('pen'); setWidthMenuOpen(false); }} aria-label={`Use ${color}`} />
                ))}
              </div>
              <span className="toolbar-divider" />
              <button title="Rectangle" className={`reference-tool shape-tool ${tool === 'rect' ? 'active' : ''}`} onClick={() => { setTool('rect'); setWidthMenuOpen(false); }}><Square size={22} /><span>Rectangle</span></button>
              <button title="Ellipse" className={`reference-tool shape-tool ${tool === 'ellipse' ? 'active' : ''}`} onClick={() => { setTool('ellipse'); setWidthMenuOpen(false); }}><RectangleHorizontal size={22} /><span>Ellipse</span></button>
              <button className="graphie-mark" title="Graphie"><span>G</span></button>
            </div>

            {selectedObject && (() => {
              const bounds = objectBounds(selectedObject);
              const anchor = worldToScreen({ x: bounds.left, y: bounds.top }, viewport);
              return <div className="object-menu" style={{ left: `${(anchor.x / canvasSize.width) * 100}%`, top: `${Math.max(2, (anchor.y / canvasSize.height) * 100 - 7)}%` }} onPointerDown={(event) => event.stopPropagation()}>
                <span className="object-menu-label">{selectedObject.kind}</span>
                {selectedObject.kind === 'text' ? <button onClick={() => setEditingTextId(selectedObject.id)}><Type size={15} /> Edit</button> : <>
                  <label title="Stroke color"><input type="color" value={selectedObject.kind === 'stroke' ? selectedObject.color : selectedObject.stroke} onChange={(event) => updateSelectedObject(selectedObject.kind === 'stroke' ? { color: event.target.value } : { stroke: event.target.value })} /></label>
                  {selectedObject.kind !== 'stroke' && selectedObject.kind !== 'line' && <label title="Fill color"><input type="color" value={selectedObject.fill === 'transparent' ? '#ffffff' : selectedObject.fill} onChange={(event) => updateSelectedObject({ fill: event.target.value })} /></label>}
                </>}
                <button title="Delete" onClick={deleteSelection}>Delete</button>
              </div>;
            })()}

            {editingTextId && (() => {
              const text = objects.find((obj): obj is TextObject => obj.id === editingTextId && obj.kind === 'text');
              if (!text) return null;
              const point = worldToScreen({ x: text.x, y: text.y }, viewport);
              return <input className="canvas-text-editor" autoFocus value={text.text} placeholder="Type here..." onChange={(event) => updateSelectedObject({ text: event.target.value })} onBlur={() => setEditingTextId(null)} onKeyDown={(event) => { if (event.key === 'Escape' || event.key === 'Enter') setEditingTextId(null); }} style={{ left: `${(point.x / canvasSize.width) * 100}%`, top: `${(point.y / canvasSize.height) * 100}%` }} />;
            })()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
