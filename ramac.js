/* ----------------------------------------------------------------------
 *
 * Installer
 *
 * Usage:
 * <script type=text/javascript src=ramac.js></script>
 * <script type=text/javascript>
 * ramac_install(document.forms.form1.input1, '/cgi-bin-perl/ramac.pl?prefix=');
 * </script>
 *
 * ----------------------------------------------------------------------
 */

/*@cc_on @*/
/*@if (@_jscript_version >= 5) @*/

var version = "$Revision: 1.132 $";

function ramac_install(input, url, params) {
    if (!ramac_http()) {
        return; // alas, no way to request data, we retreat
    }

    if (navigator) {
        var ua = navigator.userAgent.toLowerCase();
        if (ua.indexOf('msie 5') != -1 && ua.indexOf('windows 98') != -1)
            return; // "for your protection" (c)
    }

    var popup = new Ramac_Popup(input, url, params || {});

    ramac_add_handler(input, 'keydown', function (evt) { popup.keydown(evt); });
    ramac_add_handler(input, 'keyup', function (evt) { popup.keyup(evt); });
    ramac_add_handler(input, 'keypress', function (evt) { popup.keypress(evt); });
    ramac_add_handler(input, 'blur', function () { popup.on_blur(); });
    ramac_add_handler(input, 'focus', function () { popup.on_focus(); });

    ramac_mainloop(popup);
}

function ramac_add_handler(element, event_type, func) {
    if (element.attachEvent) {                  // IE
        element.attachEvent('on' + event_type, func);
    } else if (element.addEventListener) {      // W3C
        element.addEventListener(event_type, func, false);
    } else {                                    // should not happen
        element['on' + event_type] = func;
    }
}

function ramac_event(evt) {
    return (evt) ? evt : ((window.event) ? event : null);
}

function ramac_quotemeta(str) {
    return str.replace(new RegExp("([^A-Za-z0-9])", "g"), "\\$1");
}

/* ----------------------------------------------------------------------
 *
 * Event handlers
 *
 * ----------------------------------------------------------------------
 */

// should we mutex refresh and key{up|down} by a lock?

/*
KEY_UP = 38, KEY_DOWN = 40, KEY_ESC = 27, KEY_ENTER = 13, KEY_MACRETURN = 3,
KEY_BS = 8, KEY_DELETE = 46, KEY_LEFT = 37, KEY_HOME = 36;
KEY_RIGHT = 39;
KEY_F2 = 113;
KEY_PGDN = 34; KEY_PGUP = 33;
*/

Ramac_Popup.prototype.keydown = function(evt) {
    evt = ramac_event(evt);

    if (evt && ramac_nonstd_kbd(evt)) {
        this.process_keys(evt);
    }
    /* and on std_kbd browsers we process_keys in keypress */
}

/* The logic is: if MSIE than do magic (arrow keys, enter, the like)
 * in keydown, because a) keypress is fired only for alphanumerics,
 * b) keydown is repeating (until key release).
 * If Moz, process those special keys right here in keypress, because
 * keydown is non-repeating (fires once on pressing the key, then
 * there's a series of keypress events until release when a single
 * keyup fires. This sequence works for ANY key and Moz event objects
 * have two distinct properties, one for key code and one for char
 * code (std_kbd_desc) */

Ramac_Popup.prototype.keypress = function(evt) {
    evt = ramac_event(evt);

    if (evt) {
        /* on MSIE keypress fires only on alphanumerics (and ESC), so we call
         * process_keys in keydown */
        if (evt.ctrlKey) return;
        if (
            (ramac_nonstd_kbd(evt) && evt.keyCode != 27)  // KEY_ESC
                ||
            (!this.process_keys(evt))   /* this does lots of things on std_kbd browsers
                                         * too bad the call is obscured :( */
        ) {
            this.typed_text = this.unselected_part();  // save
            this.typed_text += String.fromCharCode(evt.charCode || evt.keyCode);
            this.positioning_allowed = true;
            if (this.select_item()) {
                ramac_cancel(evt);
            }
        }
    }
}

function ramac_nonstd_kbd(evt) {
    // this is a test for non-standard IE keyboard events model
    // search this file for std_kbd_desc for explanation

    // .reason is IE-only property (smth to do with db binding)
    return typeof evt.reason != 'undefined' || ramac_safari;
}

/* this function processes special keys like arrows, enter and esc. It
 * returns false if the key is not special so that we could process it
 * in another way */
Ramac_Popup.prototype.process_keys = function(evt) {
    if (!this.hidden) {
        switch (evt.keyCode) {
            case 40:    // KEY_DOWN
                this.position_at(this.selected_item + 1);
                this.update_input();
                ramac_cancel(evt);
                break;
            case 38:    // KEY_UP
                if (this.selected_item == 0) {
                    // exit from popup up into input, restore text
                    this.current_word(this.typed_text);
                    this.position_at(-1);
                } else {
                    this.position_at(this.selected_item - 1);
                    this.update_input();
                }
                ramac_cancel(evt);
                break;
            case 34:    // KEY_PGDN
                this.position_at(this.items.last_item);
                this.update_input();
                ramac_cancel(evt);
                break;
            case 33:    // KEY_PGUP
                this.position_at(0);
                this.update_input();
                ramac_cancel(evt);
                break;
            case 13:    // KEY_ENTER
            case 3:     // KEY_MACRETURN
                this.confirm();
                ramac_cancel(evt);
                break;
            case 27:    // KEY_ESC
                this.current_word(this.typed_text);
                this.hide(true);
                break;
            case 37:    // KEY_LEFT
            case 36:    // KEY_HOME
                /* these keys deselect (cancel) selection range in the
                   input and therefore act as if the user suddenly typed
                   current word up to the end. popup behaves weirdly
                   so we need to special-case them.

                   btw, we need to update ramac_saved to avoid race when a refresh
                   fires between KEY_LEFT.down and KEY_LEFT.up
                   and btw, KEY_LEFT and KEY_HOME does not change .value
                   on keyup so it's safe */
                //this.last_refreshed_input = this.typed_text = this.input.value;
                this.last_refreshed_input = this.typed_text = this.current_word();
                this.position_at(-1);
                break;
            default:
                return evt.charCode == 0;   // false on Moz and alphanumerics
        }
        return true;
    } else {
        if (evt.keyCode == 39) {    // KEY_RIGHT
            if (this.bulb && this.bulb_lit && this.typing_pos() == this.input.value.length) {
                this.show(true);
                this.select_item();
                ramac_cancel(evt);
            }
	    return true;
        }

	return false;
        //return evt.charCode == 0;   // false on Moz and alphanumerics
    }
}

Ramac_Popup.prototype.keyup = function(evt) {
    evt = ramac_event(evt);

    if (evt) {
//        ramac_debug(evt.keyCode + ':key <down> char:' + evt.charCode + '>' + popup.input.value);

        switch (evt.keyCode) {
            case 8:     // KEY_BS
            case 46:    // KEY_DELETE
                this.typed_text = this.unselected_part();  // save
                this.position_at(-1);
                this.positioning_allowed = false;
        }
    }
}

function ramac_cancel(evt) {
    evt.returnValue = false;
    evt.cancelBubble = true;
    if (evt.preventDefault) {
        evt.preventDefault();
    }
    if (evt.stopPropagation) {
        evt.stopPropagation();
    }
}

Ramac_Popup.prototype.select_item = function () {
    if (!this.hidden && this.positioning_allowed) {
        var new_pos = this.seek();
        this.position_at(new_pos);

        if (new_pos != -1) {
            this.update_input(1);
            return true;
        }
    }
    return false;
}

Ramac_Popup.prototype.on_blur = function() {
    if (!this.flipping_focus) {
        if (!this.hidden) {
            this.hide();
        }
        clearTimeout(this.loop_id);
        this.focused = false;
        this.out_bulb();
    }
}

Ramac_Popup.prototype.on_focus = function() {
    if (!this.flipping_focus) {
        this.focused = true;
        ramac_mainloop(this);
    } else {
        this.flipping_focus = false;
    }
}

Ramac_Popup.prototype.confirm = function() {
    if (this.on_confirm) {
	var items = this.items, index = this.selected_item, row = [items[index]];
	if (items.extra) {
	    for(var col_index = 0; col_index < items.extra.length; ++col_index)
		row[row.length] = items.extra[col_index][index];
	}

        this.on_confirm.apply(this, row);
    }

    /*
     * on_confirm DOES NOT have the ability to cancel or invalidate
     * selection (as it did once).
     * The reason is we cannot prevent user from entering by hand
     * or from clipboard a value that on_confirm would not "approve".
     * We only can prevent her from selecting "bad" values from our
     * autocompletion popup.
     * And the conclusion is: do your validation either in onBlur or
     * (better) in onSubmit. Only there your will catch as much cases
     * as possible.
     *
     * That raises a question whether on_confirm is of any use at all.
     * But it's used on intranet.rambler.ru for bringing up a popup.
     */

    this.update_input();

    if (this.delim)
        this.current_word(this.current_word() + this.delim);

    this.park_caret();
    
    this.last_refreshed_input = this.typed_text = this.current_word();
    this.hide(true);

    if (this.submit_form) {
        var url = this.REQ_URL + ramac_escape('\1' + this.last_refreshed_input);
        var req;
        if (req = ramac_http()) {
            req.open('GET', url, true);
            req.send(null);
        }

        this.submit_form.submit();
    }
}

Ramac_Popup.prototype.current_word_start = function() {
    // whoa, -1 magically turns into 0!
    var start = this.input.value.lastIndexOf(this.trimmed_delim, this.typing_pos() - 1) + 1;
    while (this.input.value.charAt(start) == ' ') {
        ++start;
    }

    return start;
}

Ramac_Popup.prototype.current_word = function(new_value) {
    var value = this.input.value;

    var start = this.current_word_start();

    if (typeof new_value == 'undefined') {
        return value.substring(start);
    } else {
        this.input.value = value.substring(0, start) + new_value;
        this.park_caret();
    }
}

// Simple versions of the two above for cases when there are no words
// to complete separately. See installer for details.

var simple_current_word_start = function() {
    return 0;
}

var simple_current_word = function(new_value) {
    if (typeof new_value == 'undefined') {
        return this.input.value;
    } else {
        this.input.value = new_value;
        this.park_caret();
        return this.input.value;
    }
}

Ramac_Popup.prototype.update_input = function(select_new) {
    if (this.selected_item < 0) {
        return;
    }

    var start = this.typed_text.length;

    this.current_word(this.items[this.selected_item]);

    if (select_new) {
        this.hilite_in_word(start);
    }
}

Ramac_Popup.prototype.typing_pos = function() {
    var rv = this.input.value.length;

    // Moz (lighter version)
    if (this.input.setSelectionRange) {
        rv = this.input.selectionStart;
    // IE
    } else if (this.input.createTextRange) {
        var range = document.selection.createRange();
        var i_range = this.input.createTextRange();

        // if the current selection is within the edit control			
        if (i_range.inRange(range)) {
            if (i_range.boundingLeft == range.boundingLeft) {
                rv = 0;
            } else {
                var contents = i_range.text;
                var index = 1;
                while (index < contents.length) {
                    i_range.findText(contents.substring(index));
                    if (i_range.boundingLeft == range.boundingLeft)
                        break;
                    
                    index++;
                }
                
                rv = index;
            }
        }
    }

    return rv;
}

Ramac_Popup.prototype.unselected_part = function() {
    var selection_start = this.input.value.length;
    // Moz
    if (this.input.setSelectionRange) {
        selection_start = this.input.value.length -
            (this.input.selectionEnd - this.input.selectionStart);
    // IE
    } else if (document.selection) {
        var range = document.selection.createRange();
        selection_start = this.input.value.length - range.text.length;
    }
    
    return this.input.value.substring(this.current_word_start(), selection_start);
}

Ramac_Popup.prototype.hilite_in_word = function(start) {
    start += this.current_word_start();
    var end = this.current_word_start() + this.current_word().length;

    if (this.input.createTextRange) {
        var range = this.input.createTextRange();
        range.moveStart('character', start);
        range.moveEnd  ('character', end);
        range.select();
    } else if (this.input.setSelectionRange) {
        this.input.setSelectionRange(start, end);
    }
}

Ramac_Popup.prototype.park_caret = function() {
    if (this.input.createTextRange) {
        var range = this.input.createTextRange();
        range.collapse(false);
        range.select();
    } else if (this.input.setSelectionRange) {
        this.input.setSelectionRange(this.input.value.length, this.input.value.length);
    }
}

Ramac_Popup.prototype.position_at = function(index) {
    if (index > this.items.last_item) {
        index = this.items.last_item;
    }

    if (index < -1) {
        index = -1;
    }

    if (index != this.selected_item) {
        if (this.selected_item != -1) {
            this.div.childNodes[this.selected_item].className = '';
        }

        if (index != -1) {
            this.div.childNodes[index].className = 'ramac_selected';
        }

        this.selected_item = index;
    }
}

/* ----------------------------------------------------------------------
 *
 * Constructor, on/off, filler
 *
 * ----------------------------------------------------------------------
 */

var ramac_msie_box =
    navigator && navigator.userAgent.toLowerCase().indexOf('msie') != -1;

var ramac_safari =
    navigator && navigator.userAgent.toLowerCase().indexOf('safari') != -1;

function Ramac_Popup(input, url, params) {
    this.div = document.createElement('div');
    (params["div_container"] || document.body).appendChild(this.div);
    this.items = [];
    this.items.last_item = -1;
    this.selected_item = -1;

    this.bulb_lit = false;
    this.activated = false;

    this.params = params;

    this.hide();    // hide right away

    this.div.className = 'ramac_popup';

    var st = this.div.style;

    st.zIndex       = 1;
    st.padding      = 0;
    st.overflow     = 'hidden';       // yahoo comments say that this causes error in IE
                                      // www.quirksmode.org says it is
                                      // Ok, though

    this.input      = input;  // save a ref to original text input
    this.REQ_URL    = url;    // request url
    this.cache      = {};     // cache is empty

    st.height = '0px';        // hidden right away

    this.place_popup();

    this.item_height= params["item_height"];

    this.submit_form= params["auto_submit"] ? input.form : null;

    if (params["bulb"]) {
        this.bulb = document.getElementById(params["bulb"]);
    } else {
        this.bulb_lit = true;
        this.activate_ac(true);
    }

    if (!params["delim"]) {
        // use simpler implementations (a magnitude or two faster)
        this.current_word_start = simple_current_word_start;
        this.current_word = simple_current_word;
    } else {
        var delim = params["delim"];

        this.delim = delim;
        while (delim.charAt(0) == ' ') delim = delim.substring(1, delim.length);
        while (delim.charAt(delim.length - 1) == ' ') delim = delim.substring(0, delim.length - 1);
        this.trimmed_delim = delim;
    }

    this.on_confirm = params["on_confirm"];
    this.force_single = params["force_single"];
    this.prefix_filter_threshold = params["prefix_filter_threshold"];

    this.local_match_function = params["local_match_function"]
        || function(subject, object) {
            return subject.indexOf(object) != -1;
        }

    if (params["use_seq_scan"]) {
        this.seek = seq_scan;
    }
}

Ramac_Popup.prototype.light_bulb = function() {
    if (this.bulb) {
        this.bulb.innerHTML = '&rarr;';
        this.bulb_lit = true;
    }
}

Ramac_Popup.prototype.out_bulb = function() {
    if (this.bulb) {
        this.bulb.innerHTML = '&nbsp;';
	this.bulb_lit = false;
    }
}

Ramac_Popup.prototype.activate_ac = function(on, flip_focus) {
    if (on) {
        this.input.setAttribute('autocomplete', 'off');
        // comments in yahoo say that Moz supports this only on form
        // level,
        // but Firefox 1.0+ works ok, I tried
        // input.form.setAttribute('autocomplete', 'off');

        if (flip_focus) {
            this.flipping_focus = true;

            this.input.blur();
            this.input.focus();
        }

        this.activated = true;
    } else {
        this.input.setAttribute('autocomplete', 'on');  // XXX does not work in Moz
        this.activated = false;
    }
}

Ramac_Popup.prototype.show = function(activate) {
    if (this.hidden) {
        if (activate) {
            this.activate_ac(true, true);
        }
        
        this.place_popup();
        this.div.style.display = 'block';
        this.hidden = false;
    }
}

Ramac_Popup.prototype.hide = function (deactivate) {
    if (!this.hidden) {
        // this.position_at(-1);  // deselect or else selected_item is saved

        /* this seem to break mouse selection in Opera (Opera JS error)
           so comment out */

        this.div.style.display = 'none';
        this.hidden = true;

        if (this.bulb && deactivate) {
            this.activate_ac(false);
        }
    }
}

Ramac_Popup.prototype.place_popup = function() {
    var st      = this.div.style;

    // calculate left and top by adding offsets of all parents
    var origin = this.input, p_top = 0, p_left = 0, p_width = 0;
    while (origin) {
        p_top     += origin.offsetTop;
        p_left    += origin.offsetLeft;

        // needs position: relative in parent
        if (origin.offsetParent && !window.opera) {
            p_top   -= origin.scrollTop || 0;
            p_left  -= origin.scrollLeft || 0;
        }

        origin   = origin.offsetParent;
    }

    // special case by Danny Goodman
    if (navigator.userAgent.indexOf('Mac') != -1 &&
        typeof document.body.leftMargin != 'undefined') {

        p_top     += document.body.topMargin;
        p_left    += document.body.leftMargin;
    }

    // G: '- 2' unless MSIE
    p_width = this.input.offsetWidth - (!ramac_msie_box ? 2 : 0);

    if (navigator.userAgent.indexOf('Opera 9') != -1) {
        p_left  += 3;
        p_width -= 8;
        p_top   -= 2;
    }

    if (this.params["width"]) {
        st.width = this.params["width"] + 'px';

        // popup horizontal alignment
        if (this.params["align"] == 'right') {
            p_left -= this.params["width"] - p_width;
        }
    } else {
        st.width = p_width + 'px';
    }

    st.left = p_left + 'px';

    // position right under the "input"
    st.position = 'absolute';
    st.top = (p_top + this.input.offsetHeight - 1) + 'px'; // G: '- 1'
}

Ramac_Popup.prototype.populate = function() {
    while (this.div.hasChildNodes()) {
        this.div.removeChild(this.div.firstChild);
    }

    this.selected_item = -1;

    var item_height = this.item_height || 16;

    this.div.style.height = (this.items.length * (item_height + 1) + (ramac_msie_box ? 2 : 0)) + 'px';  // +1 for paddingBottom

    for(var index = 0; index < this.items.length; ++index) {
        var el = document.createElement('div');
        el.style.height = (ramac_msie_box && navigator.userAgent.indexOf('Opera 9') == -1 ? item_height + 1 : item_height) + 'px';
        el.style.paddingLeft = '2px';
        el.style.paddingRight = '2px';
        el.style.paddingBottom = '1px';
        el.style.cursor = 'default';
        el.style.whiteSpace = 'nowrap';

        el.style.overflow = 'hidden';

        /* warning: hardcore functional programming ahead
           we create an anonymous function which returns an anonymous
           function (actually a closure) with two args curried away.
           we then call the outer one in place to perform the currying.
           I love JavaScript! --kap */
        el.onmouseover = function(popup, index) {
            return function() { popup.position_at(index); };
        }(this, index);

        el.onmousedown = function(popup) {
            return function(evt) {
                evt = ramac_event(evt);
                popup.confirm();

                /* i thereby dub the interneth explorer JThcripth an ugly methth of bugth. --kap
                   this hack is needed for IE not to lose focus on input.
                   firefox works flawlessly without it. */

                /* i thereby dub the opera javathcripth an even more
                   uglier one! we need to add the focuth() call for Opera to
                   behave. */
                ramac_cancel(evt);
                setTimeout(function() {
                        popup.input.focus();
                        popup.park_caret();
                    }, 10);

            }
        }(this);

        var left_col = document.createElement('span');
        left_col.className = 'ramac_left_col';
        left_col.style.cssFloat = 'left';
        left_col.style.textAlign = 'left';
        left_col.style.overflow = 'hidden';

        left_col.innerHTML = this.items[index];
        el.appendChild(left_col);

        if (!this.force_single && this.items.extra && this.items.extra[0]) {
            left_col.style.overflow = 'visible';
            left_col.style.width = '50%';

            var right_col = document.createElement('span');
            right_col.className = 'ramac_right_col';
            right_col.style.cssFloat = 'right';
            right_col.style.textAlign = 'right';
            right_col.style.overflow = 'hidden';
            right_col.style.width = '49%';
            right_col.innerHTML = this.items.extra[0][index]; // content
            el.appendChild(right_col);
        }

        if (this.items[index].substring(0, 1) == ' ') { // marker of 'list not complete'
            this.items.last_item = index - 1;
            left_col.style.fontSize = '80%';
        }

        this.div.appendChild(el);
    }
}

/* ----------------------------------------------------------------------
 *
 * Self-scheduling mainloop which refreshes the popup
 * Alas, setInterval() solution is not half that flexible.
 *
 * ----------------------------------------------------------------------
 */

function ramac_mainloop(popup) {
    popup.refresh();
    if (popup.focused)
        popup.loop_id = setTimeout(function() { ramac_mainloop(popup); }, 300);
}

Ramac_Popup.prototype.refresh = function() {
    var text = this.typed_text;

    if (text == this.last_refreshed_input) {
        return;
    }

    if (this.current_word() == '') {
        this.out_bulb();
        this.hide();
    } else {
        var items = this.fetch_items(text);

        if (items && items.length > 0) {
            if (items[0] == 'EAGAIN') {  // XXX bad magic
                // result not ready (yet)
                return;
            }

            this.items = items;

            this.populate();
            this.light_bulb();
            
            if (this.activated)
                this.show();

            if (!this.hidden)
                this.select_item();
        } else {
            this.out_bulb();
            this.hide();
        }
    }

    this.last_refreshed_input = text;
}

/* ----------------------------------------------------------------------
 * slightly modified binary search
 *
 * turned out to be extremely efficient when compared to seqscan on
 * arrays of >5-6 elements
 *
 * should probably use localeCompare
 * but works ok without it both with english and russian
 *
 * ----------------------------------------------------------------------
 */
Ramac_Popup.prototype.seek = function() {
    var items = this.items;
    var new_selected_item = -1;

    if (!items || items.length == 0) {
        return -1;
    }

    var prefix = this.typed_text.toLowerCase();

    var low = 0, high = items.length - 1, mid;
    var item;

    while (low <= high) {
        mid = (low + high) >> 1;    // div 2
        item = items[mid].toLowerCase();

        if (item == prefix) {
            new_selected_item = mid;
            break;
        } else if (item > prefix) {
            high = mid - 1;
        } else {
            low = mid + 1;
        }
    }

    if (new_selected_item == -1 && items[low] && items[low].toLowerCase().indexOf(prefix) == 0) {
        new_selected_item = low;
    }

    return new_selected_item;
}

var seq_scan = function() {
    var items = this.items;

    if (!items || items.length == 0) {
        return -1;
    }

    var prefix = this.typed_text.toLowerCase();

    for (var cur = 0; cur < items.length; ++cur)
        if (items[cur].toLowerCase().indexOf(prefix) == 0) {
            return cur;
        }

    return -1;
}

Ramac_Popup.prototype.fetch_items = function(prefix) {
    prefix = prefix.toLowerCase();

    var items = this.cache[prefix];

    if (items) {
        return items;
    } else {
        if (this.prefix_filter_threshold) {
            // try to calculate items right here
            var prefix_len = prefix.length;

            while (prefix_len > 0) {
                --prefix_len;
                var items_pre = this.cache[prefix.substring(0, prefix_len)];
                if (items_pre && items_pre.length < this.prefix_filter_threshold) {
                    // found! now filter into items

                    var items = [];
                    if (!this.force_single && items_pre.extra && items_pre.extra[0]) {
                        items.extra = [];
                        for (var xcol = 0; xcol < items_pre.extra.length; ++xcol)
                            items.extra[items.extra.length] = [];
                    }

                    // this is effectively (a kind of) grep
                    for (var index = 0; index < items_pre.length; ++index) {
                        if (this.local_match_function(items_pre[index].toLowerCase(), prefix)) {
                            // now push the item onto items

                            items[items.length] = items_pre[index]; // aka .push
                            if (typeof items.extra != 'undefined')
                                for (var xcol = 0; xcol < items.extra.length; ++xcol)
                                    items.extra[xcol][items.extra[xcol].length] = items_pre.extra[xcol][index];
                        }
                    }

                    return this.cache[prefix] = items;
                }
            }
        }
        
        this.request(prefix);
        return this.cache[prefix];
    }
}

Ramac_Popup.prototype.request = function(prefix) {
    var url = this.REQ_URL + ramac_escape(prefix);

    this.cache[prefix] = ['EAGAIN'];

    var req;
    if (req = ramac_http()) {
        // we do not mess with addListeners and attachEvents because
        // the object is just created and there cannot be any handlers on
        // it which we would like to keep attached
        // and, btw, they do not work on IE http requester :)
        req.onreadystatechange = function(popup) {
            return function () { ramac_req_change(req, popup.cache[prefix]); };
        }(this);
        req.open('GET', url, true);
        req.send(null);
    }
}

function ramac_http() {
    var req = null;

    // momche has even more variants here: + 'MSXML' & 'MSXML3'
    var progids = ['MSXML2.XmlHttp.4.0', 'MSXML2.XmlHttp', 'Microsoft.XmlHttp'];
/*@if (@_jscript_version >= 5)
    for (index = 0; index < progids.length; ++index) {
        try {
            req = new ActiveXObject(progids[index]);
            break;
        } catch(ex) {
            req = null;
        }
    }
  @else @*/
    req = null;
/*@end @*/

    if (!req && window.XMLHttpRequest) {
        req = new XMLHttpRequest();
    }

    return req;
}

function ramac_req_change(req, items) {
    // only if req shows `loaded'
    if (req.readyState == 4) {
        // only if `OK'
        try {
            if (req.status != 200) {
                throw(req.statusText);
            }

            var res;
            // eval('res = ' + req.responseText + '.sort();');
            try {
                eval('res = ' + req.responseText + ';')
            } catch(ex) {
                ramac_error("Bad array:\n" + req.responseText);
            }

            items.length = 0;

            if (res && res.length > 0) {
                if (typeof res[0] == 'object') {
                    // we have got multiple columns, so use them
                    items.extra = res.slice(1);
                    res = res[0];
                }

                for (var index = 0; index < res.length; ++index) {
                    items[index] = res[index];
                }
            }

            items.last_item = items.length - 1;
        } catch(ex) {
            items.length = 0;
            ramac_error("There was a problem retrieving remote data:\n" + ex);
        }
        delete req.onreadystatechange;
    }
}

var re_plus = new RegExp("\\+", "g");
var ramac_escape = typeof encodeURIComponent == 'function'
    ? function(uri) { return encodeURIComponent(uri); }
    : function(uri) {
        return escape(uri).replace(re_plus, '%2B'); /* partial compatibility, works only for ASCII */
    };

/*@else
function ramac_install() {
    ;
}
@end @*/

// __END__

function ramac_error(str) {
    ramac_debug(str);
    var req;
    if (req = ramac_http()) {
        req.open('POST', '/cgi-bin-perl/warn.pl', true);
        req.send(null);
    }
    // but should be NOP in production!
    // actually, errors on running system should throttle operation
    // by lowering the frequency of requests or something of this kind
}

/* ----------------------------------------------------------------------
 *
 * Debugger
 * example:
 * ramac_debug(popup.ramac_saved_input + ' in ' + items + ' ==> ' + new_selected_item);
 * ramac_debug(popup.ramac_saved_input, popup.selected_item);
 *
 * ----------------------------------------------------------------------
 */
function ramac_debug() {
    // arguments is somewhat magical -- it does not have .join()
    var args = [];
    for(var index = 0; index < arguments.length; ++index) {
        if (typeof arguments[index] != 'undefined')
            args[args.length] = arguments[index].toString();
    }

    var msg = document.createElement('pre');
    msg.style.margin = '0px';
    msg.appendChild(document.createTextNode(args.join(', ')));
    document.body.appendChild(msg);
}
