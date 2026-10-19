import {Marked} from 'marked';
import type {TokenizerExtension} from 'marked';

// Model-written Markdown (Fox replies, Attention briefs) often puts bold or italics right against
// CJK text or punctuation: "**时间：**10月5日", "请在**周五（10月9日）**前回复", "**Due: **Friday".
// CommonMark's flanking rules leave those asterisks as literal text, so the bold never showed
// (owner report 2026-10-04). These tokenizers take a closed pair on one line whatever surrounds it;
// everything else, and every HTML rule, stays marked's own, and callers still sanitize the result.
const strong: TokenizerExtension={name:'looseStrong',level:'inline',
 start:src=>src.match(/\*/)?.index,
 tokenizer(src){
  const m=/^\*\*(?!\s)([^\n]*?[^\s\\][ \t]*)\*\*(?!\*)/.exec(src);
  if(m)return {type:'strong',raw:m[0],text:m[1],tokens:this.lexer.inlineTokens(m[1])};
 }};
const em: TokenizerExtension={name:'looseEm',level:'inline',
 start:src=>src.match(/\*/)?.index,
 tokenizer(src){
  const m=/^\*(?![\s*])([^\n*]*?[^\s*\\])\*(?!\*)/.exec(src);
  if(m)return {type:'em',raw:m[0],text:m[1],tokens:this.lexer.inlineTokens(m[1])};
 }};
/** The Markdown parser for model-written text. */
export const modelMarkdown=new Marked({extensions:[strong,em]});
