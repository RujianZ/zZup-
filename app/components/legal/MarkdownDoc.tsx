import React from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../context/ThemeContext';
import type { LegalDocKey } from '../../../lib/legal/documents.generated';

/**
 * 只渲染法律文书实际用到的那点 Markdown，**不引 Markdown 库**。
 *
 * 两份正本数过：h1-h3、段落、（带一级缩进的）无序列表、粗体、斜体、链接、
 * 分隔线，外加隐私政策里唯一一个两列表格。八种，就这些。
 *
 * 跟 ChatScreen 里那个 RichText 是同一个判断：引一个库进来意味着它支持的一切
 * （图片、HTML、代码块、任意 URL scheme）都成了渲染面，而这里渲染的是我们
 * 自己的文本，不需要那么大的面。
 *
 * 文书之间的链接（terms 里点 Privacy Notice）走 onInternalLink 在 App 内跳转；
 * mailto: 和外部链接才交给系统。
 */

type Props = {
  body: string;
  onInternalLink?: (key: LegalDocKey) => void;
};

const INTERNAL: Record<string, LegalDocKey> = {
  'terms.html': 'terms',
  'privacy.html': 'privacy',
  'guidelines.html': 'guidelines',
};

/** 粗体 / 斜体 / 链接 / 自动链接（`<admin@zzup.org>`）—— 一次切分，顺序无关 */
const INLINE_RE = /(\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]]+\]\([^)]+\)|<(?:https?:\/\/|mailto:)?[^\s<>@]+@[^\s<>]+>|<https?:\/\/[^\s<>]+>)/g;

function Inline({
  text,
  style,
  c,
  onInternalLink,
}: {
  text: string;
  style: any;
  c: ThemeColors;
  onInternalLink?: (key: LegalDocKey) => void;
}) {
  // 不要在这里加「只有一段就直接返回 text」的捷径：整行都是粗体时，切分完
  // 过滤掉两端空串正好剩一段，那条捷径会把 **星号** 原样打出来。
  const parts = text.split(INLINE_RE).filter((p) => p);

  return (
    <Text style={style}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <Text key={i} style={{ fontWeight: '700', color: c.text }}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return (
            <Text key={i} style={{ fontStyle: 'italic' }}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        // `[标签](目标)` 和 `<admin@zzup.org>` 两种写法，正本里都有
        const md = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        const auto = !md && part.startsWith('<') && part.endsWith('>')
          ? part.slice(1, -1).replace(/^mailto:/, '')
          : null;
        if (md || auto) {
          const label = md ? md[1] : auto!;
          const href = md ? md[2] : (auto!.includes('@') ? `mailto:${auto}` : auto!);
          const internal = INTERNAL[href.replace(/^\.\//, '')];
          return (
            <Text
              key={i}
              style={{ color: c.brand, fontWeight: '600' }}
              onPress={() => {
                if (internal) onInternalLink?.(internal);
                // 外部链接和 mailto 交给系统。打不开就静默 —— 文书里的链接
                // 打不开不该把整个阅读界面搞崩
                else Linking.openURL(href).catch(() => {});
              }}
            >
              {label}
            </Text>
          );
        }
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
}

type Block =
  | { t: 'h1' | 'h2' | 'h3' | 'p'; text: string }
  | { t: 'li'; text: string; depth: number }
  | { t: 'hr' }
  | { t: 'table'; head: string[]; rows: string[][] };

function parse(md: string): Block[] {
  const lines = md.split(/\r?\n/);
  const out: Block[] = [];
  let para: string[] = [];

  const flush = () => {
    if (para.length) {
      out.push({ t: 'p', text: para.join(' ').trim() });
      para = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    if (line === '') { flush(); continue; }

    if (/^---+$/.test(line)) { flush(); out.push({ t: 'hr' }); continue; }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flush();
      out.push({ t: (`h${h[1].length}` as 'h1' | 'h2' | 'h3'), text: h[2].trim() });
      continue;
    }

    if (line.startsWith('|')) {
      flush();
      const table: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim());
        // |---|---| 那行是分隔符，不是数据
        if (!cells.every((cell) => /^:?-{2,}:?$/.test(cell))) table.push(cells);
        i++;
      }
      i--;
      if (table.length) out.push({ t: 'table', head: table[0], rows: table.slice(1) });
      continue;
    }

    const li = raw.match(/^(\s*)-\s+(.*)$/);
    if (li) {
      flush();
      out.push({ t: 'li', text: li[2].trim(), depth: li[1].length >= 2 ? 1 : 0 });
      continue;
    }

    para.push(line);
  }
  flush();
  return out;
}

export default function MarkdownDoc({ body, onInternalLink }: Props) {
  const { colors: c } = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  const blocks = React.useMemo(() => parse(body), [body]);

  return (
    <View>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'h1':
            return <Inline key={i} text={b.text} style={s.h1} c={c} onInternalLink={onInternalLink} />;
          case 'h2':
            return <Inline key={i} text={b.text} style={s.h2} c={c} onInternalLink={onInternalLink} />;
          case 'h3':
            return <Inline key={i} text={b.text} style={s.h3} c={c} onInternalLink={onInternalLink} />;
          case 'hr':
            return <View key={i} style={s.hr} />;
          case 'li':
            return (
              <View key={i} style={[s.liRow, b.depth > 0 && s.liNested]}>
                <Text style={s.bullet}>{b.depth > 0 ? '–' : '•'}</Text>
                <Inline text={b.text} style={s.liText} c={c} onInternalLink={onInternalLink} />
              </View>
            );
          case 'table':
            return (
              <View key={i} style={s.table}>
                <View style={s.tableHead}>
                  {b.head.map((cell, j) => (
                    <Text key={j} style={[s.tableHeadCell, j === 0 && s.tableCol1]} numberOfLines={2}>
                      {cell}
                    </Text>
                  ))}
                </View>
                {b.rows.map((row, j) => (
                  <View key={j} style={s.tableRow}>
                    {row.map((cell, k) => (
                      <View key={k} style={[s.tableCellWrap, k === 0 && s.tableCol1]}>
                        <Inline text={cell} style={s.tableCell} c={c} onInternalLink={onInternalLink} />
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            );
          default:
            return <Inline key={i} text={b.text} style={s.p} c={c} onInternalLink={onInternalLink} />;
        }
      })}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    h1: { fontSize: 22, fontWeight: '800', color: c.text, marginTop: 28, marginBottom: 10, letterSpacing: -0.4 },
    h2: { fontSize: 18, fontWeight: '700', color: c.text, marginTop: 26, marginBottom: 8, letterSpacing: -0.2 },
    h3: { fontSize: 15, fontWeight: '700', color: c.text, marginTop: 18, marginBottom: 6 },
    p: { fontSize: 14.5, lineHeight: 23, color: c.subText, marginBottom: 12 },
    hr: { height: 1, backgroundColor: c.border, marginVertical: 20 },

    liRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8, paddingRight: 4 },
    liNested: { paddingLeft: 18 },
    bullet: { fontSize: 14.5, lineHeight: 23, color: c.brand },
    // alignSelf:'stretch' 而不是 width:'100%' —— 百分比在内容宽度的父容器里会塌
    liText: { flex: 1, fontSize: 14.5, lineHeight: 23, color: c.subText },

    table: { borderWidth: 1, borderColor: c.border, borderRadius: 12, overflow: 'hidden', marginVertical: 12 },
    tableHead: { flexDirection: 'row', backgroundColor: c.cardMutedBg, paddingVertical: 9, paddingHorizontal: 12 },
    tableHeadCell: { flex: 1.4, fontSize: 11.5, fontWeight: '700', color: c.tertiaryText, letterSpacing: 0.3 },
    tableRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: c.border },
    tableCellWrap: { flex: 1.4 },
    tableCol1: { flex: 1, paddingRight: 10 },
    tableCell: { fontSize: 13, lineHeight: 19, color: c.subText },
  });
