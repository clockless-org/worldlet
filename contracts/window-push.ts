// The push notification a paired phone receives (platform/web/README.md, Push). A wire shape shared by the host, the
// relay and Tasks, which ask for pushes; kept here so Agent need not import Platform.
/** A notification for the paired phone (platform/web/README.md, Push), sealed whole with place `push` (platform/web/pairing.ts
 * PUSH_BOX_PLACE): the phone opens it and shows `title` and `body`; a tap opens `open`: the item's card, the Applet's
 * page or Fox's dialogue (the app's Now when it names none). */
export type PhonePush={v:1,id:string,at:number,kind:'attention'|'fox'|'routine'|'task',title:string,body:string,open:{item?:string,applet?:string,conversation?:true},act?:PhonePushAct};
/** What the notification's own buttons do (platform/web/README.md, Push › Actions), answered from the shade with the
 * phone's ordinary sealed messages: `attention` (an item id) offers Done and Later (`attention` message), `reply` an inline
 * reply said where `open` points (`chat` with its item or Applet), `approval` (the request id) Allow once, when `once`
 * says it is offered, and Deny (`approval` message). Optional, so an older phone shows the notification as before. */
export type PhonePushAct={attention:string}|{reply:true}|{approval:string,once?:true};
/** What a module asks PhoneService.notify for; `collapse` replaces an earlier notification with the same key. */
export type PhonePushRequest=Omit<PhonePush,'v'|'id'|'at'>&{collapse?:string};
