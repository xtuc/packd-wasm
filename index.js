const express = require("express");
const { decode } = require("@webassemblyjs/wasm-parser");
const { traverse } = require("@webassemblyjs/ast");
const { get } = require("https");

const app = express();
const port = 3000;

const decoderOpts = {
  ignoreCodeSection: true,
  ignoreDataSection: true
};

function download(url, cb) {
  const data = [];

  const req = get(url, (res) => {
    res.on("data", (chunk) => data.push(chunk));
    res.on("end", () => cb(Buffer.concat(data)))
  });

  req.on("error", (e) => {
    throw err;
  });
}


function renderTemplate({imports, url}) {
  let importObject = "";

  Object.keys(imports).forEach(key => {
    importObject += `"${key}": {`;

    Object.keys(imports[key]).forEach(key2 => {
      const val = imports[key][key2];
      importObject += `"${val}": imports["${key}"]["${val}"],`;
    });

    importObject += "},";
  });

  return `
    function instantiate(imports) {
      const importObject = { ${importObject} };

      const url = "${url}";
      const req = window.fetch(url);
      return WebAssembly
        .instantiateStreaming(req, importObject)
        .then(res => res.instance.exports);
    }
  `;
}

const toUnpkg = path => "https://unpkg.com/" + path;

app.get("/*", (req, res) => {
  const url = toUnpkg(req.params[0]);

  // download
  // FIXME(sven): we could decode while downloading and aborting when the import
  // section has been decoded
  download(url, (buffer) => {
    // decode
    const ast = decode(buffer, decoderOpts);

    // generate res

    const imports = {};

    traverse(ast, {
      ModuleImport({node}) {
        if (imports[node.module] === undefined) {
          imports[node.module] = [];
        }

        imports[node.module].push(node.name);
      }

      // FIXME(sven): could also generate memory or table objects in import
      // to avoid the config mismatch
    });

    res.set("Content-Type", "application/javascript");
    res.send(renderTemplate({imports, url}));
  });
});

app.listen(port, () => console.log(`listening on port ${port}!`));
