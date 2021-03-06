(function() {

var Rserve = {};

(function() {

function make_basic(type, proto) {
    proto = proto || {
        json: function() { 
            throw "json() unsupported for type " + this.type;
        }
    };
    var wrapped_proto = {
        json: function(resolver) {
            var result = proto.json.call(this, resolver);
            result.r_type = type;
            if (!_.isUndefined(this.attributes))
                result.r_attributes = _.object(_.map(
                    this.attributes.value,
                    function(v) { return [v.name, v.value.json(resolver)]; }));
            return result;
        }
    };
    return function(v, attrs) {
        function r_object() {
            this.type = type;
            this.value = v;
            this.attributes = attrs;
        }
        r_object.prototype = wrapped_proto;
        var result = new r_object();
        return result;
    };
}

Rserve.Robj = {
    "null": function(attributes) {
        return { 
            type: "null", 
            value: null,
            attributes: attributes,
            json: function() { return null; }
        };
    },

    clos: function(formals, body, attributes) {
        return {
            type: "clos",
            value: { formals: formals,
                     body: body },
            attributes: attributes,
            json: function() { throw "json() unsupported for type clos"; }
        };
    },

    vector: make_basic("vector", {
        json: function(resolver) {
            var values = _.map(this.value, function (x) { return x.json(resolver); });
            if (_.isUndefined(this.attributes)) {
                return values;
            } else {
                if(this.attributes.value[0].name!="names")
                    throw "expected names here";
                var keys   = this.attributes.value[0].value.value;
                var result = {};
                _.each(keys, function(key, i) {
                    result[key] = values[i];
                });
                return result;
            }
        }
    }),
    symbol: make_basic("symbol", { 
        json: function() {
            return this.value;
        }
    }),
    list: make_basic("list"),
    lang: make_basic("lang", {
        json: function(resolver) {
            var values = _.map(this.value, function (x) { return x.json(resolver); });
            if (_.isUndefined(this.attributes)) {
                return values;
            } else {
                if(this.attributes.value[0].name!="names")
                    throw "expected names here";
                var keys   = this.attributes.value[0].value.value;
                var result = {};
                _.each(keys, function(key, i) {
                    result[key] = values[i];
                });
                return result;
            }
        }
    }),
    tagged_list: make_basic("tagged_list", {
        json: function(resolver) {
            function classify_list(list) {
                if (_.all(list, function(elt) { return elt.name === null; })) {
                    return "plain_list";
                } else if (_.all(list, function(elt) { return elt.name !== null; })) {
                    return "plain_object";
                } else
                    return "mixed_list";
            }
            var list = this.value.slice(1);
            switch (classify_list(list)) {
            case "plain_list":
                return _.map(list, function(elt) { return elt.value.json(resolver); });
            case "plain_object":
                return _.object(_.map(list, function(elt) { 
                    return [elt.name, elt.value.json(resolver)];
                }));
            case "mixed_list":
                return list;
            default:
                throw "Internal Error";
            }
        }
    }),
    tagged_lang: make_basic("tagged_lang", {
        json: function(resolver) {
            var pair_vec = _.map(this.value, function(elt) { return [elt.name, elt.value.json(resolver)]; });
            return pair_vec;
        }
    }),
    vector_exp: make_basic("vector_exp"),
    int_array: make_basic("int_array", {
        json: function() {
            if(this.attributes && this.attributes.type==='tagged_list' 
               && this.attributes.value[0].name==='levels'
               && this.attributes.value[0].value.type==='string_array') {
                var levels = this.attributes.value[0].value.value;
                var arr = _.map(this.value, function(factor) { return levels[factor-1]; });
                arr.levels = levels;
                return arr;
            }
            else {
                if (this.value.length === 1)
                    return this.value[0];
                else
                    return this.value;
            }
        }
    }),
    double_array: make_basic("double_array", {
        json: function() {
            if (this.value.length === 1 && _.isUndefined(this.attributes))
                return this.value[0];
            else
                return this.value;
        }
    }),
    string_array: make_basic("string_array", {
        json: function(resolver) {
            if (this.value.length === 1) {
                if (_.isUndefined(this.attributes))
                    return this.value[0];
                if (this.attributes.value[0].name === 'class' &&
                    this.attributes.value[0].value.value.indexOf("javascript_function") !== -1)
                    return resolver(this.value[0]);
                return this.value;
            } else
                return this.value;
        }
    }),
    bool_array: make_basic("bool_array", {
        json: function() {
            if (this.value.length === 1 && _.isUndefined(this.attributes))
                return this.value[0];
            else
                return this.value;
        }
    }),
    raw: make_basic("raw", {
        json: function() {
            if (this.value.length === 1 && _.isUndefined(this.attributes))
                return this.value[0];
            else
                return this.value;
        }
    }),
    string: make_basic("string", {
        json: function() {
            return this.value;
        }
    })
};

})();
// Simple constants and functions are defined here,
// in correspondence with Rserve's Rsrv.h

Rserve.Rsrv = {
    PAR_TYPE: function(x) { return x & 255; },
    PAR_LEN: function(x) { return x >> 8; },
    PAR_LENGTH: function(x) { return x >> 8; },
    par_parse: function(x) { return [Rserve.Rsrv.PAR_TYPE(x), Rserve.Rsrv.PAR_LEN(x)]; },
    SET_PAR: function(ty, len) { return ((len & 0xffffff) << 8 | (ty & 255)); },
    CMD_STAT: function(x) { return (x >> 24) & 127; },
    SET_STAT: function(x, s) { return x | ((s & 127) << 24); },

    CMD_RESP           : 0x10000,
    RESP_OK            : 0x10000 | 0x0001,
    RESP_ERR           : 0x10000 | 0x0002,
    OOB_SEND           : 0x20000 | 0x1000,
    OOB_MSG            : 0x20000 | 0x2000,
    ERR_auth_failed    : 0x41,
    ERR_conn_broken    : 0x42,
    ERR_inv_cmd        : 0x43,
    ERR_inv_par        : 0x44,
    ERR_Rerror         : 0x45,
    ERR_IOerror        : 0x46,
    ERR_notOpen        : 0x47,
    ERR_accessDenied   : 0x48,
    ERR_unsupportedCmd : 0x49,
    ERR_unknownCmd     : 0x4a,
    ERR_data_overflow  : 0x4b,
    ERR_object_too_big : 0x4c,
    ERR_out_of_mem     : 0x4d,
    ERR_ctrl_closed    : 0x4e,
    ERR_session_busy   : 0x50,
    ERR_detach_failed  : 0x51,
    ERR_disabled       : 0x61,
    ERR_unavailable    : 0x62,
    ERR_cryptError     : 0x63,
    ERR_securityClose  : 0x64,

    CMD_login            : 0x001,
    CMD_voidEval         : 0x002,
    CMD_eval             : 0x003,
    CMD_shutdown         : 0x004,
    CMD_switch           : 0x005,
    CMD_keyReq           : 0x006,
    CMD_secLogin         : 0x007,
    CMD_OCcall           : 0x00f,
    CMD_openFile         : 0x010,
    CMD_createFile       : 0x011,
    CMD_closeFile        : 0x012,
    CMD_readFile         : 0x013,
    CMD_writeFile        : 0x014,
    CMD_removeFile       : 0x015,
    CMD_setSEXP          : 0x020,
    CMD_assignSEXP       : 0x021,
    CMD_detachSession    : 0x030,
    CMD_detachedVoidEval : 0x031,
    CMD_attachSession    : 0x032,
    CMD_ctrl             : 0x40,
    CMD_ctrlEval         : 0x42,
    CMD_ctrlSource       : 0x45,
    CMD_ctrlShutdown     : 0x44,
    CMD_setBufferSize    : 0x081,
    CMD_setEncoding      : 0x082,
    CMD_SPECIAL_MASK     : 0xf0,
    CMD_serEval          : 0xf5,
    CMD_serAssign        : 0xf6,
    CMD_serEEval         : 0xf7,

    DT_INT        : 1,
    DT_CHAR       : 2,
    DT_DOUBLE     : 3,
    DT_STRING     : 4,
    DT_BYTESTREAM : 5,
    DT_SEXP       : 10,
    DT_ARRAY      : 11,
    DT_LARGE      : 64,

    XT_NULL          : 0,
    XT_INT           : 1,
    XT_DOUBLE        : 2,
    XT_STR           : 3,
    XT_LANG          : 4,
    XT_SYM           : 5,
    XT_BOOL          : 6,
    XT_S4            : 7,
    XT_VECTOR        : 16,
    XT_LIST          : 17,
    XT_CLOS          : 18,
    XT_SYMNAME       : 19,
    XT_LIST_NOTAG    : 20,
    XT_LIST_TAG      : 21,
    XT_LANG_NOTAG    : 22,
    XT_LANG_TAG      : 23,
    XT_VECTOR_EXP    : 26,
    XT_VECTOR_STR    : 27,
    XT_ARRAY_INT     : 32,
    XT_ARRAY_DOUBLE  : 33,
    XT_ARRAY_STR     : 34,
    XT_ARRAY_BOOL_UA : 35,
    XT_ARRAY_BOOL    : 36,
    XT_RAW           : 37,
    XT_ARRAY_CPLX    : 38,
    XT_UNKNOWN       : 48,
    XT_LARGE         : 64,
    XT_HAS_ATTR      : 128,

    BOOL_TRUE  : 1,
    BOOL_FALSE : 0,
    BOOL_NA    : 2,

    GET_XT: function(x) { return x & 63; },
    GET_DT: function(x) { return x & 63; },
    HAS_ATTR: function(x) { return (x & Rsrv.XT_HAS_ATTR) > 0; },
    IS_LARGE: function(x) { return (x & Rsrv.XT_LARGE) > 0; },

    // # FIXME A WHOLE LOT OF MACROS HERE WHICH ARE PROBABLY IMPORTANT
    // ##############################################################################

    status_codes: {
        0x41 : "ERR_auth_failed"   ,
        0x42 : "ERR_conn_broken"   ,
        0x43 : "ERR_inv_cmd"       ,
        0x44 : "ERR_inv_par"       ,
        0x45 : "ERR_Rerror"        ,
        0x46 : "ERR_IOerror"       ,
        0x47 : "ERR_notOpen"       ,
        0x48 : "ERR_accessDenied"  ,
        0x49 : "ERR_unsupportedCmd",
        0x4a : "ERR_unknownCmd"    ,
        0x4b : "ERR_data_overflow" ,
        0x4c : "ERR_object_too_big",
        0x4d : "ERR_out_of_mem"    ,
        0x4e : "ERR_ctrl_closed"   ,
        0x50 : "ERR_session_busy"  ,
        0x51 : "ERR_detach_failed" ,
        0x61 : "ERR_disabled"      ,
        0x62 : "ERR_unavailable"   ,
        0x63 : "ERR_cryptError"    ,
        0x64 : "ERR_securityClose"
    }
};
(function() {

function read(m)
{
    var handlers = {};

    function lift(f, amount) {
        return function(attributes, length) {
            return [f.call(that, attributes, length), amount || length];
        };
    }

    function bind(m, f) {
        return function(attributes, length) {
            var t = m.call(that, attributes, length);
            var t2 = f(t[0])(attributes, length - t[1]);
            return [t2[0], t[1] + t2[1]];
        };
    }

    function unfold(f) {
        return function(attributes, length) {
            var result = [];
            var old_length = length;
            while (length > 0) {
                var t = f.call(that, attributes, length);
                result.push(t[0]);
                length -= t[1];
            }
            return [result, old_length];
        };
    }

    var that = {
        offset: 0,
        data_view: m.make(Rserve.EndianAwareDataView),
        msg: m,

        //////////////////////////////////////////////////////////////////////

        read_int: function() {
            var old_offset = this.offset;
            this.offset += 4;
            return this.data_view.getInt32(old_offset);
        },
        read_string: function(length) {
            // FIXME SLOW
            var result = "";
            while (length--) {
                var c = this.data_view.getInt8(this.offset++);
                if (c) result = result + String.fromCharCode(c);
            }
            return result;
        },
        read_stream: function(length) {
            var old_offset = this.offset;
            this.offset += length;
            return this.msg.view(old_offset, length);
        },
        read_int_vector: function(length) {
            var old_offset = this.offset;
            this.offset += length;
            return this.msg.make(Int32Array, old_offset, length);
        },
        read_double_vector: function(length) {
            var old_offset = this.offset;
            this.offset += length;
            return this.msg.make(Float64Array, old_offset, length);
        },

        //////////////////////////////////////////////////////////////////////
        // these are members of the reader monad

        read_null: lift(function(a, l) { return Rserve.Robj.null(a); }),

        read_unknown: lift(function(a, l) { 
            this.offset += l;
            return Rserve.Robj.null(a); 
        }),

        read_string_array: function(attributes, length) {
            var a = this.read_stream(length).make(Uint8Array);
            var result = [];
            var current_str = "";
            for (var i=0; i<a.length; ++i)
                if (a[i] === 0) {
                    result.push(current_str);
                    current_str = "";
                } else {
                    current_str = current_str + String.fromCharCode(a[i]);
                }
            return [Rserve.Robj.string_array(result, attributes), length];
        },
        read_bool_array: function(attributes, length) {
            var l2 = this.read_int();
            var s = this.read_stream(length-4);
            var a = _.map(s.make(Uint8Array).subarray(0, l2), function(v) {
                return v ? true : false;
            });
            return [Rserve.Robj.bool_array(a, attributes), length];
        },
        read_raw: function(attributes, length) {
            var l2 = this.read_int();
            var s = this.read_stream(length-4);
            var a = s.make(Uint8Array).subarray(0, l2).buffer;
            return [Rserve.Robj.raw(a, attributes), length];
        },

        read_sexp: function() {
            var d = this.read_int();
            var _ = Rserve.Rsrv.par_parse(d);
            var t = _[0], l = _[1];
            var total_read = 4;
            var attributes = undefined;
            if (t & Rserve.Rsrv.XT_HAS_ATTR) {
                t = t & ~Rserve.Rsrv.XT_HAS_ATTR;
                var attr_result = this.read_sexp();
                attributes = attr_result[0];
                total_read += attr_result[1];
                l -= attr_result[1];
            }
            if (handlers[t] === undefined) {
                throw new Rserve.RserveError("Unimplemented " + t, -1);
            } else {
                var result = handlers[t].call(this, attributes, l);
                return [result[0], total_read + result[1]];
            }
        }
    };

    that.read_clos = bind(that.read_sexp, function(formals) { 
              return bind(that.read_sexp, function(body)    { 
              return lift(function(a, l) {
              return Rserve.Robj.clos(formals, body, a); 
              }, 0);
              } );
    });

    that.read_list = unfold(that.read_sexp);

    function read_symbol_value_pairs(lst) {
        var result = [];
        for (var i=0; i<lst.length; i+=2) {
            var value = lst[i], tag = lst[i+1];
            if (tag.type === "symbol") {
                result.push({ name: tag.value,
                              value: value });
            } else {
                result.push({ name: null,
                              value: value });
            }
        }
        return result;
    }
    that.read_list_tag = bind(that.read_list, function(lst) {
        return lift(function(attributes, length) {
            var result = read_symbol_value_pairs(lst);
            return Rserve.Robj.tagged_list(result, attributes);
        }, 0);
    });
    that.read_lang_tag = bind(that.read_list, function(lst) {
        return lift(function(attributes, length) {
            var result = read_symbol_value_pairs(lst);
            return Rserve.Robj.tagged_lang(result, attributes);
        }, 0);
    });

    function xf(f, g) { return bind(f, function(t) { 
        return lift(function(a, l) { return g(t, a); }, 0); 
    }); }
    that.read_vector       = xf(that.read_list, Rserve.Robj.vector);
    that.read_list_no_tag  = xf(that.read_list, Rserve.Robj.list);
    that.read_lang_no_tag  = xf(that.read_list, Rserve.Robj.lang);
    that.read_vector_exp   = xf(that.read_list, Rserve.Robj.vector_exp);

    function sl(f, g) { return lift(function(a, l) {
        return g(f.call(that, l), a);
    }); }
    that.read_symname      = sl(that.read_string,        Rserve.Robj.symbol);
    that.read_int_array    = sl(that.read_int_vector,    Rserve.Robj.int_array);
    that.read_double_array = sl(that.read_double_vector, Rserve.Robj.double_array);

    handlers[Rserve.Rsrv.XT_NULL]         = that.read_null;
    handlers[Rserve.Rsrv.XT_UNKNOWN]      = that.read_unknown;
    handlers[Rserve.Rsrv.XT_VECTOR]       = that.read_vector;
    handlers[Rserve.Rsrv.XT_CLOS]         = that.read_clos;
    handlers[Rserve.Rsrv.XT_SYMNAME]      = that.read_symname;
    handlers[Rserve.Rsrv.XT_LIST_NOTAG]   = that.read_list_no_tag;
    handlers[Rserve.Rsrv.XT_LIST_TAG]     = that.read_list_tag;
    handlers[Rserve.Rsrv.XT_LANG_NOTAG]   = that.read_lang_no_tag;
    handlers[Rserve.Rsrv.XT_LANG_TAG]     = that.read_lang_tag;
    handlers[Rserve.Rsrv.XT_VECTOR_EXP]   = that.read_vector_exp;
    handlers[Rserve.Rsrv.XT_ARRAY_INT]    = that.read_int_array;
    handlers[Rserve.Rsrv.XT_ARRAY_DOUBLE] = that.read_double_array;
    handlers[Rserve.Rsrv.XT_ARRAY_STR]    = that.read_string_array;
    handlers[Rserve.Rsrv.XT_ARRAY_BOOL]   = that.read_bool_array;
    handlers[Rserve.Rsrv.XT_RAW]          = that.read_raw;

    handlers[Rserve.Rsrv.XT_STR]          = sl(that.read_string, Rserve.Robj.string);

    return that;
}

function parse(msg)
{
    var result = {};
    var header = new Int32Array(msg, 0, 4);
    var resp = header[0] & 16777215, status_code = header[0] >> 24;
    result.header = [resp, status_code];

    if (result.header[0] === Rserve.Rsrv.RESP_ERR) {
        result.ok = false;
        result.status_code = status_code;
        result.message = "ERROR FROM R SERVER: " + (Rserve.Rsrv.status_codes[status_code] || 
                                         status_code)
               + " " + result.header[0] + " " + result.header[1]
               + " " + msg.byteLength
               + " " + msg;
        return result;
    }

    if (!_.contains([Rserve.Rsrv.RESP_OK, Rserve.Rsrv.OOB_SEND, Rserve.Rsrv.OOB_MSG], result.header[0])) {
        result.ok = false;
        result.message = "Unexpected response from RServe: " + result.header[0] + " status: " + Rserve.Rsrv.status_codes[status_code];
        return result;
    }
    result.ok = true;
    result.payload = parse_payload(msg);
    return result;
}

function parse_payload(msg)
{
    var payload = Rserve.my_ArrayBufferView(msg, 16, msg.byteLength - 16);
    if (payload.length === 0)
        return null;

    var reader = read(payload);

    var d = reader.read_int();
    var _ = Rserve.Rsrv.par_parse(d);
    var t = _[0], l = _[1];
    if (t === Rserve.Rsrv.DT_INT) {
        return { type: "int", value: reader.read_int() };
    } else if (t === Rserve.Rsrv.DT_STRING) {
        return { type: "string", value: reader.read_string(l) };
    } else if (t === Rserve.Rsrv.DT_BYTESTREAM) { // NB this returns a my_ArrayBufferView()
        return { type: "stream", value: reader.read_stream(l) };
    } else if (t === Rserve.Rsrv.DT_SEXP) {
        _ = reader.read_sexp();
        var sexp = _[0], l2 = _[1];
        return { type: "sexp", value: sexp };
    } else
        throw new Rserve.RserveError("Bad type for parse? " + t + " " + l, -1);
}

Rserve.parse_websocket_frame = parse;
Rserve.parse_payload = parse_payload;

})();
// we want an endian aware dataview mostly because ARM can be big-endian, and
// that might put us in trouble wrt handheld devices.
//////////////////////////////////////////////////////////////////////////////

(function() {
    var _is_little_endian;

    (function() {
        var x = new ArrayBuffer(4);
        var bytes = new Uint8Array(x),
        words = new Uint32Array(x);
        bytes[0] = 1;
        if (words[0] === 1) {
            _is_little_endian = true;
        } else if (words[0] === 16777216) {
            _is_little_endian = false;
        } else {
            throw "we're bizarro endian, refusing to continue";
        }
    })();

    Rserve.EndianAwareDataView = (function() {
        
        var proto = {
            'setInt8': function(i, v) { return this.view.setInt8(i, v); },
            'setUint8': function(i, v) { return this.view.setUint8(i, v); },
            'getInt8': function(i) { return this.view.getInt8(i); },
            'getUint8': function(i) { return this.view.getUint8(i); }
        };

        var setters = ['setInt32', 'setInt16', 'setUint32', 'setUint16',
                       'setFloat32', 'setFloat64'];
        var getters = ['getInt32', 'getInt16', 'getUint32', 'getUint16',
                       'getFloat32', 'getFloat64'];

        for (var i=0; i<setters.length; ++i) {
            var name = setters[i];
            proto[name]= (function(name) {
                return function(byteOffset, value) {
                    return this.view[name](byteOffset, value, _is_little_endian);
                };
            })(name);
        }
        for (i=0; i<getters.length; ++i) {
            var name = getters[i];
            proto[name]= (function(name) {
                return function(byteOffset) {
                    return this.view[name](byteOffset, _is_little_endian);
                };
            })(name);
        }

        function my_dataView(buffer, byteOffset, byteLength) {
            if (byteOffset === undefined) {
                // work around node.js bug https://github.com/joyent/node/issues/6051
                if (buffer.byteLength === 0) {
                    this.view = {
                        byteLength: 0, byteOffset: 0
                    };
                } else
                    this.view = new DataView(buffer);
            } else {
                this.view = new DataView(buffer, byteOffset, byteLength);
            }
        };
        my_dataView.prototype = proto;
        return my_dataView;
    })();

    Rserve.my_ArrayBufferView = function(b, o, l) {
        o = _.isUndefined(o) ? 0 : o;
        l = _.isUndefined(l) ? b.byteLength : l;
        return {
            buffer: b,
            offset: o,
            length: l,
            data_view: function() {
                return new Rserve.EndianAwareDataView(this.buffer, this.offset, 
                                                      this.buffer.byteLength - this.offset);
            },
            make: function(ctor, new_offset, new_length) { 
                new_offset = _.isUndefined(new_offset) ? 0 : new_offset;
                new_length = _.isUndefined(new_length) ? this.length : new_length;
                var element_size = ctor.BYTES_PER_ELEMENT || 1;
                var n_els = new_length / element_size;
                if ((this.offset + new_offset) % element_size != 0) {
                    var view = new DataView(this.buffer, this.offset + new_offset, new_length);
                    var output_buffer = new ArrayBuffer(new_length);
                    var out_view = new DataView(output_buffer);
                    for (var i=0; i < new_length; ++i) {
                        out_view.setUint8(i, view.getUint8(i));
                    }
                    return new ctor(output_buffer);
                } else {
                    return new ctor(this.buffer, 
                                    this.offset + new_offset, 
                                    n_els);
                }
            },
            skip: function(offset) {
                return Rserve.my_ArrayBufferView(
                    this.buffer, this.offset + offset, this.buffer.byteLength);
            },
            view: function(new_offset, new_length) {
                // FIXME Needs bounds checking
                return Rserve.my_ArrayBufferView(
                    this.buffer, this.offset + new_offset, new_length);
            }
        };
    };

})(this);

(function() {

function _encode_command(command, buffer) {
    if (!_.isArray(buffer))
        buffer = [buffer];
    var length = _.reduce(buffer, 
                          function(memo, val) {
                              return memo + val.byteLength;
                          }, 0),
        big_buffer = new ArrayBuffer(16 + length),
        view = new Rserve.EndianAwareDataView(big_buffer);
    view.setInt32(0, command);
    view.setInt32(4, length);
    view.setInt32(8, 0);
    view.setInt32(12, 0);
    var offset = 16;
    _.each(buffer, function(b) {
        var source_array = new Uint8Array(b);
        for (var i=0; i<source_array.byteLength; ++i)
            view.setUint8(offset+i, source_array[i]);
        offset += b.byteLength;
    });
    return big_buffer;
};

function _encode_string(str) {
    var strl = ((str.length + 1) + 3) & ~3; // pad to 4-byte boundaries.
    var payload_length = strl + 4;
    var result = new ArrayBuffer(payload_length);
    var view = new Rserve.EndianAwareDataView(result);
    view.setInt32(0, Rserve.Rsrv.DT_STRING + (strl << 8));
    for (var i=0; i<str.length; ++i)
        view.setInt8(4+i, str.charCodeAt(i));
    return result;
};

function _encode_bytes(bytes) {
    var payload_length = bytes.length;
    var header_length = 4;
    var result = new ArrayBuffer(payload_length + header_length);
    var view = new Rserve.EndianAwareDataView(result);
    view.setInt32(0, Rserve.Rsrv.DT_BYTESTREAM + (payload_length << 8));
    for (var i=0; i<bytes.length; ++i)
        view.setInt8(4+i, bytes[i]);
    return result;
};

Rserve.create = function(opts) {
    var host = opts.host;
    var onconnect = opts.on_connect;
    var socket = new WebSocket(host);
    socket.binaryType = 'arraybuffer';
    var handle_error = opts.on_error || function(error) { throw new Rserve.RserveError(error, -1); };
    var received_handshake = false;

    var result;
    var command_counter = 0;

    var captured_functions = {};

    var fresh_hash = function() {
        var k;
        do {
            // while js has no crypto rngs :(
            k = String(Math.random()).slice(2,12);
        } while (k in captured_functions);
        if (k.length !== 10)
            throw new Error("Bad rng, no cookie");
        return k;
    };
    
    function convert_to_hash(value) {
        var hash = fresh_hash();
        captured_functions[hash] = value;
        return hash;
    }

    function _encode_value(value, forced_type)
    {
        var sz = Rserve.determine_size(value, forced_type);
        var buffer = new ArrayBuffer(sz + 4);
        var view = Rserve.my_ArrayBufferView(buffer);
        view.data_view().setInt32(0, Rserve.Rsrv.DT_SEXP + (sz << 8));
        Rserve.write_into_view(value, view.skip(4), forced_type, convert_to_hash);
        return buffer;
    }
    
    function hand_shake(msg)
    {
        msg = msg.data;
        if (typeof msg === 'string') {
            if (msg.substr(0,4) !== 'Rsrv') {
                handle_error("server is not an RServe instance", -1);
            } else if (msg.substr(4, 4) !== '0103') {
                handle_error("sorry, rserve only speaks the 0103 version of the R server protocol", -1);
            } else if (msg.substr(8, 4) !== 'QAP1') {
                handle_error("sorry, rserve only speaks QAP1", -1);
            } else {
                received_handshake = true;
                if (opts.login)
                    result.login(opts.login);
                result.running = true;
                onconnect && onconnect.call(result);
            }
        } else {
            var view = new DataView(msg);
            var header = String.fromCharCode(view.getUint8(0)) + 
                String.fromCharCode(view.getUint8(1)) + 
                String.fromCharCode(view.getUint8(2)) + 
                String.fromCharCode(view.getUint8(3));

            if (header === 'RsOC') {
                received_handshake = true;
                result.ocap_mode = true;
                result.bare_ocap = Rserve.parse_payload(msg).value;
                result.ocap = Rserve.wrap_ocap(result, result.bare_ocap);
                result.running = true;
                onconnect && onconnect.call(result);
            } else
                handle_error("Unrecognized server answer: " + header, -1);
        }
    }

    socket.onclose = function(msg) {
        result.running = false;
        result.closed = true;
        opts.on_close && opts.on_close(msg);
    };

    socket.onmessage = function(msg) {
        // node.js Buffer vs ArrayBuffer workaround
        if (msg.data.constructor.name === 'Buffer')
            msg.data = (new Uint8Array(msg.data)).buffer;
        if (opts.debug)
            opts.debug.message_in && opts.debug.message_in(msg);
        if (!received_handshake) {
            hand_shake(msg);
            return;
        } 
        if (typeof msg.data === 'string') {
            opts.on_raw_string && opts.on_raw_string(msg.data);
            return;
        }
        var v = Rserve.parse_websocket_frame(msg.data);
        if (!v.ok) {
            handle_error(v.message, v.status_code);
        } else if (v.header[0] === Rserve.Rsrv.RESP_OK) {
            result_callback(v.payload);
        } else if (v.header[0] === Rserve.Rsrv.OOB_SEND) {
            opts.on_data && opts.on_data(v.payload);
        } else if (v.header[0] === Rserve.Rsrv.OOB_MSG) {
            if (result.ocap_mode) {
                var p;
                try {
                    p = v.payload.value.json(result.resolve_hash);
                } catch (e) {
                    _send_cmd_now(Rserve.Rsrv.RESP_ERR | Rserve.Rsrv.OOB_MSG, 
                                  _encode_string(String(e)));
                    return;
                }
                if (!_.isFunction(p[0])) {
                    _send_cmd_now(Rserve.Rsrv.RESP_ERR | Rserve.Rsrv.OOB_MSG, 
                                  _encode_string("OOB Messages on ocap-mode must be javascript function calls"));
                    return;
                }
                var captured_function = p[0], params = p.slice(1);
                params.push(function(result) {
                    _send_cmd_now(Rserve.Rsrv.OOB_MSG, _encode_value(result));
                });
                captured_function.apply(undefined, params);
            } else {
                if (_.isUndefined(opts.on_oob_message)) {
                    _send_cmd_now(Rserve.Rsrv.RESP_ERR | Rserve.Rsrv.OOB_MSG, 
                                  _encode_string("No handler installed"));
                } else {
                    in_oob_message = true;
                    opts.on_oob_message(v.payload, function(message, error) {
                        if (!in_oob_message) {
                            handle_error("Don't call oob_message_handler more than once.");
                            return;
                        }
                        in_oob_message = false;
                        var header = Rserve.Rsrv.OOB_MSG | 
                            (error ? Rserve.Rsrv.RESP_ERR : Rserve.Rsrv.RESP_OK);
                        _send_cmd_now(header, _encode_string(message));
                        bump_queue();
                    });
                }
            }
        } else {
            handle_error("Internal Error, parse returned unexpected type " + v.header[0], -1);
        }
    };

    function _send_cmd_now(command, buffer) {
        var big_buffer = _encode_command(command, buffer);
        if (opts.debug)
            opts.debug.message_out && opts.debug.message_out(big_buffer[0], command);
        socket.send(big_buffer);
        return big_buffer;
    };

    var queue = [];
    var in_oob_message = false;
    var awaiting_result = false;
    var result_callback;
    function bump_queue() {
        if (result.closed && queue.length) {
            handle_error("Cannot send messages on a closed socket!", -1);
        } else if (!awaiting_result && !in_oob_message && queue.length) {
            var lst = queue.shift();
            result_callback = lst[1];
            awaiting_result = true;
            if (opts.debug)
                opts.debug.message_out && opts.debug.message_out(lst[0], lst[2]);
            socket.send(lst[0]);
        }
    }
    function enqueue(buffer, k, command) {
        queue.push([buffer, function(result) {
            awaiting_result = false;
            bump_queue();
            k(result);
        }, command]);
        bump_queue();
    };

    function _cmd(command, buffer, k, string) {
        k = k || function() {};
        var big_buffer = _encode_command(command, buffer);
        return enqueue(big_buffer, k, string);
    };

    result = {
        ocap_mode: false,
        running: false,
        closed: false,
        close: function() {
            socket.close();
        },

        //////////////////////////////////////////////////////////////////////
        // non-ocap mode

        login: function(command, k) {
            _cmd(Rserve.Rsrv.CMD_login, _encode_string(command), k, command);
        },
        eval: function(command, k) {
            _cmd(Rserve.Rsrv.CMD_eval, _encode_string(command), k, command);
        },
        createFile: function(command, k) {
            _cmd(Rserve.Rsrv.CMD_createFile, _encode_string(command), k, command);
        },
        writeFile: function(chunk, k) {
            _cmd(Rserve.Rsrv.CMD_writeFile, _encode_bytes(chunk), k, "");
        },
        closeFile: function(k) {
            _cmd(Rserve.Rsrv.CMD_closeFile, new ArrayBuffer(0), k, "");
        },
        set: function(key, value, k) {
            _cmd(Rserve.Rsrv.CMD_setSEXP, [_encode_string(key), _encode_value(value)], k, "");
        }, 

        //////////////////////////////////////////////////////////////////////
        // ocap mode

        OCcall: function(ocap, values, k) {
            var is_ocap = false, str;
            try {
                is_ocap |= ocap.r_attributes['class'] === 'OCref';
                str = ocap[0];
            } catch (e) {};
            try {
                is_ocap |= ocap.attributes.value[0].value.value[0] === 'OCref';
                str = ocap.value[0];
            } catch (e) {};
            if (!is_ocap)
                throw new Error("Expected an ocap, instead got " + ocap);
            var params = [str];
            params.push.apply(params, values);
            _cmd(Rserve.Rsrv.CMD_OCcall, _encode_value(params, Rserve.Rsrv.XT_LANG_NOTAG),
                 k,
                 "");
        },

        wrap_ocap: function(ocap) {
            return Rserve.wrap_ocap(this, ocap);
        },

        resolve_hash: function(hash) {
            if (!(hash in captured_functions))
                throw new Error("hash " + hash + " not found.");
            return captured_functions[hash];
        }
    };
    return result;
};

Rserve.wrap_all_ocaps = function(s, v) {
    v = v.value.json(s.resolve_hash);
    function replace(obj) {
        var result = obj;
        if (_.isArray(obj) &&
            obj.r_attributes &&
            obj.r_attributes['class'] == 'OCref') {
            return Rserve.wrap_ocap(s, obj);
        } else if (_.isArray(obj)) {
            result = _.map(obj, replace);
            result.r_type = obj.r_type;
            result.r_attributes = obj.r_attributes;
        } else if (_.isTypedArray(obj)) {
            return obj;
        } else if (_.isFunction(obj)) {
            return obj;
        } else if (_.isObject(obj)) {
            result = _.object(_.map(obj, function(v, k) {
                return [k, replace(v)];
            }));
        }
        return result;
    }
    return replace(v);
};

Rserve.wrap_ocap = function(s, ocap) {
    var wrapped_ocap = function() {
        var values = _.toArray(arguments);
        var k = values.pop();
        s.OCcall(ocap, values, function(v) {
            k(Rserve.wrap_all_ocaps(s, v));
        });
    };
    wrapped_ocap.bare_ocap = ocap;
    return wrapped_ocap;
};

})();
Rserve.RserveError = function(message, status_code) {
    this.name = "RserveError";
    this.message = message;
    this.status_code = status_code;
};

Rserve.RserveError.prototype = Object.create(Error);
Rserve.RserveError.prototype.constructor = Rserve.RserveError;
(function () {

_.mixin({
    isTypedArray: function(v) {
        if (!_.isObject(v))
            return false;
        return !_.isUndefined(v.byteLength) && !_.isUndefined(v.BYTES_PER_ELEMENT);
    }
});

// type_id tries to match some javascript values to Rserve value types
Rserve.type_id = function(value)
{
    if (_.isNull(value) || _.isUndefined(value))
        return Rserve.Rsrv.XT_NULL;
    var type_dispatch = {
        "boolean": Rserve.Rsrv.XT_ARRAY_BOOL,
        "number":  Rserve.Rsrv.XT_ARRAY_DOUBLE,
        "string":  Rserve.Rsrv.XT_ARRAY_STR // base strings need to be array_str or R gets confused?
    };
    if (!_.isUndefined(type_dispatch[typeof value]))
        return type_dispatch[typeof value];

    // typed arrays
    if (_.isTypedArray(value))
        return Rserve.Rsrv.XT_ARRAY_DOUBLE;

    // arraybuffers
    if (!_.isUndefined(value.byteLength) && !_.isUndefined(value.slice))
        return Rserve.Rsrv.XT_RAW;

    // lists of strings (important for tags)
    if (_.isArray(value) && _.all(value, function(el) { return typeof el === 'string'; }))
        return Rserve.Rsrv.XT_ARRAY_STR;

    if (_.isArray(value) && _.all(value, function(el) { return typeof el === 'boolean'; }))
        return Rserve.Rsrv.XT_ARRAY_BOOL;

    // arbitrary lists
    if (_.isArray(value))
        return Rserve.Rsrv.XT_VECTOR;

    // functions get passed as an array_str with extra attributes
    if (_.isFunction(value))
        return Rserve.Rsrv.XT_ARRAY_STR | Rserve.Rsrv.XT_HAS_ATTR;

    // objects
    if (_.isObject(value))
        return Rserve.Rsrv.XT_VECTOR | Rserve.Rsrv.XT_HAS_ATTR;

    throw new Rserve.RServeError("Value type unrecognized by Rserve: " + value);
};

// FIXME this is really slow, as it's walking the object many many times.
Rserve.determine_size = function(value, forced_type)
{
    function list_size(lst) {
        return _.reduce(lst, function(memo, el) {
            return memo + Rserve.determine_size(el);
        }, 0);
    }
    var header_size = 4, t = forced_type || Rserve.type_id(value);
    switch (t) {
    case Rserve.Rsrv.XT_NULL:
        return header_size + 0;
    case Rserve.Rsrv.XT_ARRAY_BOOL:
        if (_.isBoolean(value))
            return header_size + 8;
        else
            return header_size + ((value.length + 7) & ~3);
    case Rserve.Rsrv.XT_ARRAY_STR:
        if (_.isArray(value))
            return header_size + _.reduce(value, function(memo, str) {
                return memo + str.length + 1;
            }, 0);
        else
            return header_size + value.length + 1;
    case Rserve.Rsrv.XT_ARRAY_DOUBLE:
        if (_.isNumber(value))
            return header_size + 8;
        else
            return header_size + 8 * value.length;
    case Rserve.Rsrv.XT_RAW:
        return header_size + 4 + value.byteLength;
    case Rserve.Rsrv.XT_VECTOR:
    case Rserve.Rsrv.XT_LANG_NOTAG:
        return header_size + list_size(value);
    case Rserve.Rsrv.XT_VECTOR | Rserve.Rsrv.XT_HAS_ATTR:
        return header_size // XT_VECTOR | XT_HAS_ATTR
            + header_size // XT_LIST_TAG (attribute)
              + header_size + "names".length + 3 // length of 'names' + padding (tag as XT_SYMNAME)
              + Rserve.determine_size(_.keys(value)) // length of names
            + list_size(_.values(value)); // length of values
    case Rserve.Rsrv.XT_ARRAY_STR | Rserve.Rsrv.XT_HAS_ATTR:
        return Rserve.determine_size("0403556553") // length of string 
            + header_size // XT_LIST_TAG (attribute)
              + header_size + "class".length + 3 // length of 'class' + padding (tag as XT_SYMNAME)
              + Rserve.determine_size(["javascript_function"]); // length of class name
        
    default:
        throw new Rserve.RserveError("Internal error, can't handle type " + t);
    }
};

Rserve.write_into_view = function(value, array_buffer_view, forced_type, convert)
{
    var size = Rserve.determine_size(value, forced_type);
    if (size > 16777215)
        throw new Rserve.RserveError("Can't currently handle objects >16MB");
    var t = forced_type || Rserve.type_id(value), i, current_offset, lbl;
    var read_view;
    var write_view = array_buffer_view.data_view();
    write_view.setInt32(0, t + ((size - 4) << 8));

    switch (t) {
    case Rserve.Rsrv.XT_NULL:
        break;
    case Rserve.Rsrv.XT_ARRAY_BOOL:
        if (_.isBoolean(value)) {
            write_view.setInt32(4, 1);
            write_view.setInt8(8, value ? 1 : 0);
        } else {
            write_view.setInt32(4, value.length);
            for (i=0; i<value.length; ++i)
                write_view.setInt8(8 + i, value[i] ? 1 : 0);
        }
        break;
    case Rserve.Rsrv.XT_ARRAY_STR:
        if (_.isArray(value)) {
            var offset = 4;
            _.each(value, function(el) {
                for (var i=0; i<el.length; ++i, ++offset)
                    write_view.setUint8(offset, el.charCodeAt(i));
                write_view.setUint8(offset++, 0);
            });
        } else {
            for (i=0; i<value.length; ++i)
                write_view.setUint8(4 + i, value.charCodeAt(i));
            write_view.setUint8(4 + value.length, 0);
        }
        break;
    case Rserve.Rsrv.XT_ARRAY_DOUBLE:
        if (_.isNumber(value))
            write_view.setFloat64(4, value);
        else
            for (i=0; i<value.length; ++i)
                write_view.setFloat64(4 + 8 * i, value[i]);
        break;
    case Rserve.Rsrv.XT_RAW:
        read_view = new Rserve.EndianAwareDataView(value);
        write_view.setUint32(4, value.byteLength);
        for (i=0; i<value.byteLength; ++i) {
            write_view.setUint8(8 + i, read_view.getUint8(i));
        }
        break;
    case Rserve.Rsrv.XT_VECTOR:
    case Rserve.Rsrv.XT_LANG_NOTAG:
        current_offset = 4;
        _.each(value, function(el) {
            var sz = Rserve.determine_size(el);
            Rserve.write_into_view(el, array_buffer_view.skip(
                current_offset), undefined, convert);
            current_offset += sz;
        });
        break;
    case Rserve.Rsrv.XT_VECTOR | Rserve.Rsrv.XT_HAS_ATTR:
        current_offset = 12;
        _.each(_.keys(value), function(el) {
            for (var i=0; i<el.length; ++i, ++current_offset)
                write_view.setUint8(current_offset, el.charCodeAt(i));
            write_view.setUint8(current_offset++, 0);
        });
        write_view.setUint32(8, Rserve.Rsrv.XT_ARRAY_STR + ((current_offset - 12) << 8));

        write_view.setUint32(current_offset, Rserve.Rsrv.XT_SYMNAME + (8 << 8));
        current_offset += 4;
        lbl = "names";
        for (i=0; i<lbl.length; ++i, ++current_offset)
            write_view.setUint8(current_offset, lbl.charCodeAt(i));
        current_offset += 3;

        write_view.setUint32(4, Rserve.Rsrv.XT_LIST_TAG + ((current_offset - 8) << 8));

        _.each(_.values(value), function(el) {
            var sz = Rserve.determine_size(el);
            Rserve.write_into_view(el, array_buffer_view.skip(
                current_offset), undefined, convert);
            current_offset += sz;
        });
        break;

    case Rserve.Rsrv.XT_ARRAY_STR | Rserve.Rsrv.XT_HAS_ATTR:
        var converted_function = convert(value);
        current_offset = 12;
        var class_name = "javascript_function";
        for (i=0; i<class_name.length; ++i, ++current_offset)
            write_view.setUint8(current_offset, class_name.charCodeAt(i));
        write_view.setUint8(current_offset++, 0);
        write_view.setUint32(8, Rserve.Rsrv.XT_ARRAY_STR + ((current_offset - 12) << 8));

        write_view.setUint32(current_offset, Rserve.Rsrv.XT_SYMNAME + (8 << 8));
        current_offset += 4;
        lbl = "class";
        for (i=0; i<lbl.length; ++i, ++current_offset)
            write_view.setUint8(current_offset, lbl.charCodeAt(i));
        current_offset += 3;

        write_view.setUint32(4, Rserve.Rsrv.XT_LIST_TAG + ((current_offset - 8) << 8));

        for (i=0; i<converted_function.length; ++i)
            write_view.setUint8(current_offset + i, converted_function.charCodeAt(i));
        write_view.setUint8(current_offset + converted_function.length, 0);
        break;
    default:
        throw new Rserve.RserveError("Internal error, can't handle type " + t);
    }
};

})();
this.Rserve = Rserve;
})();
