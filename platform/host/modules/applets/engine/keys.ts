// Native key codes for CEF key events, from the DOM `code` of the person's key (the physical key,
// layout-independent). Pages read `KeyboardEvent.code` from these; text still comes from `key`.
// macOS: virtual key codes (kVK_*). Windows: the WM_KEYDOWN lParam form CEF expects, scan code in
// bits 16-23 and the extended-key flag in bit 24. Linux: X11 key codes, the evdev code plus 8.
const MAC:Record<string,number>={
 KeyA:0x00,KeyS:0x01,KeyD:0x02,KeyF:0x03,KeyH:0x04,KeyG:0x05,KeyZ:0x06,KeyX:0x07,KeyC:0x08,KeyV:0x09,IntlBackslash:0x0a,KeyB:0x0b,KeyQ:0x0c,KeyW:0x0d,KeyE:0x0e,KeyR:0x0f,
 KeyY:0x10,KeyT:0x11,Digit1:0x12,Digit2:0x13,Digit3:0x14,Digit4:0x15,Digit6:0x16,Digit5:0x17,Equal:0x18,Digit9:0x19,Digit7:0x1a,Minus:0x1b,Digit8:0x1c,Digit0:0x1d,BracketRight:0x1e,KeyO:0x1f,
 KeyU:0x20,BracketLeft:0x21,KeyI:0x22,KeyP:0x23,Enter:0x24,KeyL:0x25,KeyJ:0x26,Quote:0x27,KeyK:0x28,Semicolon:0x29,Backslash:0x2a,Comma:0x2b,Slash:0x2c,KeyN:0x2d,KeyM:0x2e,Period:0x2f,
 Tab:0x30,Space:0x31,Backquote:0x32,Backspace:0x33,Escape:0x35,MetaRight:0x36,MetaLeft:0x37,ShiftLeft:0x38,CapsLock:0x39,AltLeft:0x3a,ControlLeft:0x3b,ShiftRight:0x3c,AltRight:0x3d,ControlRight:0x3e,Fn:0x3f,
 F17:0x40,NumpadDecimal:0x41,NumpadMultiply:0x43,NumpadAdd:0x45,NumLock:0x47,AudioVolumeUp:0x48,AudioVolumeDown:0x49,AudioVolumeMute:0x4a,NumpadDivide:0x4b,NumpadEnter:0x4c,NumpadSubtract:0x4e,F18:0x4f,
 F19:0x50,NumpadEqual:0x51,Numpad0:0x52,Numpad1:0x53,Numpad2:0x54,Numpad3:0x55,Numpad4:0x56,Numpad5:0x57,Numpad6:0x58,Numpad7:0x59,F20:0x5a,Numpad8:0x5b,Numpad9:0x5c,IntlYen:0x5d,IntlRo:0x5e,NumpadComma:0x5f,
 F5:0x60,F6:0x61,F7:0x62,F3:0x63,F8:0x64,F9:0x65,Lang2:0x66,F11:0x67,Lang1:0x68,F13:0x69,F16:0x6a,F14:0x6b,F10:0x6d,ContextMenu:0x6e,F12:0x6f,F15:0x71,Insert:0x72,Home:0x73,PageUp:0x74,Delete:0x75,
 F4:0x76,End:0x77,F2:0x78,PageDown:0x79,F1:0x7a,ArrowLeft:0x7b,ArrowRight:0x7c,ArrowDown:0x7d,ArrowUp:0x7e
};
// Set-1 scan codes; values above 0xff carry the E0 extended prefix.
const WINDOWS:Record<string,number>={
 Escape:0x01,Digit1:0x02,Digit2:0x03,Digit3:0x04,Digit4:0x05,Digit5:0x06,Digit6:0x07,Digit7:0x08,Digit8:0x09,Digit9:0x0a,Digit0:0x0b,Minus:0x0c,Equal:0x0d,Backspace:0x0e,Tab:0x0f,
 KeyQ:0x10,KeyW:0x11,KeyE:0x12,KeyR:0x13,KeyT:0x14,KeyY:0x15,KeyU:0x16,KeyI:0x17,KeyO:0x18,KeyP:0x19,BracketLeft:0x1a,BracketRight:0x1b,Enter:0x1c,ControlLeft:0x1d,KeyA:0x1e,KeyS:0x1f,
 KeyD:0x20,KeyF:0x21,KeyG:0x22,KeyH:0x23,KeyJ:0x24,KeyK:0x25,KeyL:0x26,Semicolon:0x27,Quote:0x28,Backquote:0x29,ShiftLeft:0x2a,Backslash:0x2b,KeyZ:0x2c,KeyX:0x2d,KeyC:0x2e,KeyV:0x2f,
 KeyB:0x30,KeyN:0x31,KeyM:0x32,Comma:0x33,Period:0x34,Slash:0x35,ShiftRight:0x36,NumpadMultiply:0x37,AltLeft:0x38,Space:0x39,CapsLock:0x3a,F1:0x3b,F2:0x3c,F3:0x3d,F4:0x3e,F5:0x3f,
 F6:0x40,F7:0x41,F8:0x42,F9:0x43,F10:0x44,Pause:0x45,ScrollLock:0x46,Numpad7:0x47,Numpad8:0x48,Numpad9:0x49,NumpadSubtract:0x4a,Numpad4:0x4b,Numpad5:0x4c,Numpad6:0x4d,NumpadAdd:0x4e,Numpad1:0x4f,
 Numpad2:0x50,Numpad3:0x51,Numpad0:0x52,NumpadDecimal:0x53,IntlBackslash:0x56,F11:0x57,F12:0x58,IntlRo:0x73,IntlYen:0x7d,
 NumpadEnter:0xe01c,ControlRight:0xe01d,NumpadDivide:0xe035,PrintScreen:0xe037,AltRight:0xe038,NumLock:0xe045,Home:0xe047,ArrowUp:0xe048,PageUp:0xe049,ArrowLeft:0xe04b,ArrowRight:0xe04d,
 End:0xe04f,ArrowDown:0xe050,PageDown:0xe051,Insert:0xe052,Delete:0xe053,MetaLeft:0xe05b,MetaRight:0xe05c,ContextMenu:0xe05d
};
// X11 key codes (Chromium's XKB column of dom_code_data.inc).
const LINUX:Record<string,number>={
 Escape:9,Digit1:10,Digit2:11,Digit3:12,Digit4:13,Digit5:14,Digit6:15,Digit7:16,Digit8:17,Digit9:18,Digit0:19,Minus:20,Equal:21,Backspace:22,Tab:23,
 KeyQ:24,KeyW:25,KeyE:26,KeyR:27,KeyT:28,KeyY:29,KeyU:30,KeyI:31,KeyO:32,KeyP:33,BracketLeft:34,BracketRight:35,Enter:36,ControlLeft:37,KeyA:38,KeyS:39,
 KeyD:40,KeyF:41,KeyG:42,KeyH:43,KeyJ:44,KeyK:45,KeyL:46,Semicolon:47,Quote:48,Backquote:49,ShiftLeft:50,Backslash:51,KeyZ:52,KeyX:53,KeyC:54,KeyV:55,
 KeyB:56,KeyN:57,KeyM:58,Comma:59,Period:60,Slash:61,ShiftRight:62,NumpadMultiply:63,AltLeft:64,Space:65,CapsLock:66,F1:67,F2:68,F3:69,F4:70,F5:71,
 F6:72,F7:73,F8:74,F9:75,F10:76,NumLock:77,ScrollLock:78,Numpad7:79,Numpad8:80,Numpad9:81,NumpadSubtract:82,Numpad4:83,Numpad5:84,Numpad6:85,NumpadAdd:86,Numpad1:87,
 Numpad2:88,Numpad3:89,Numpad0:90,NumpadDecimal:91,Lang5:93,IntlBackslash:94,F11:95,F12:96,IntlRo:97,Lang3:98,Lang4:99,Convert:100,KanaMode:101,NonConvert:102,
 NumpadEnter:104,ControlRight:105,NumpadDivide:106,PrintScreen:107,AltRight:108,Home:110,ArrowUp:111,PageUp:112,ArrowLeft:113,ArrowRight:114,End:115,ArrowDown:116,PageDown:117,Insert:118,Delete:119,
 AudioVolumeMute:121,AudioVolumeDown:122,AudioVolumeUp:123,Power:124,NumpadEqual:125,Pause:127,NumpadComma:129,Lang1:130,Lang2:131,IntlYen:132,MetaLeft:133,MetaRight:134,ContextMenu:135,
 F13:191,F14:192,F15:193,F16:194,F17:195,F18:196,F19:197,F20:198,F21:199,F22:200,F23:201,F24:202
};
export function keyCodes(code:string,system:'mac'|'windows'|'linux'):number {
 if(system==='mac')return MAC[code]??0;
 if(system==='linux')return LINUX[code]??0;
 const scan=WINDOWS[code];
 if(scan===undefined)return 0;
 return (scan&0xff)<<16|(scan>0xff?1<<24:0)|1;
}
// macOS: the character AppKit gives a key that types no text (NSDeleteCharacter, the NS*FunctionKey
// range). CEF builds a synthetic NSEvent from each key event and takes one without a character for a
// modifier change, which reads as a key press whatever its type: each key up of Backspace then deleted
// a second character, and arrows, Tab, Escape and Delete acted twice. Modifiers keep no character.
const MAC_CHARACTERS:Record<string,number>={Backspace:0x7f,Tab:0x09,Escape:0x1b,Delete:0xf728,ArrowUp:0xf700,ArrowDown:0xf701,ArrowLeft:0xf702,ArrowRight:0xf703,
 Insert:0xf727,Home:0xf729,End:0xf72b,PageUp:0xf72c,PageDown:0xf72d,Clear:0xf739,Help:0xf746};
export function macCharacter(key:string):number {
 const f=/^F([1-9]|[12][0-9]|3[0-5])$/.exec(key);
 return f?0xf703+Number(f[1]):MAC_CHARACTERS[key]??0;
}
// Linux: CEF types the character of a key's US-layout keysym (Chromium's XKeysymForWindowsKeyCode)
// rather than the event's own character. This is that character for a key code and Shift.
const SHIFTED_DIGITS=')!@#$%^&*(',PUNCTUATION:Record<number,string>={186:';:',187:'=+',188:',<',189:'-_',190:'.>',191:'/?',192:'`~',219:'[{',220:'\\|',221:']}',222:'\'"'};
const NUMPAD:Record<number,string>={106:'*',107:'+',109:'-',110:'.',111:'/'};
export function linuxCharacter(keyCode:number,shift:boolean):string {
 if(keyCode>=65&&keyCode<=90)return String.fromCharCode(shift?keyCode:keyCode+32);
 if(keyCode>=48&&keyCode<=57)return shift?SHIFTED_DIGITS[keyCode-48]:String.fromCharCode(keyCode);
 if(keyCode>=96&&keyCode<=105)return String.fromCharCode(keyCode-48);
 if(keyCode===32)return ' ';
 return PUNCTUATION[keyCode]?.[shift?1:0]??NUMPAD[keyCode]??'';
}
