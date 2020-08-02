// tinypng.com 熊猫压缩 自动化脚本
const fs = require("fs"),
  Path = require("path"),
  https = require("https"),
  // const crypto = require("crypto")
  { URL } = require("url")
// 全局计数器
let current = 0
// 相对路径
const root = "source",
  output = "output",
  exts = [".jpg", ".png"],
  max = 5200000, // 5MB == 5*1024**2 == 5242880
  // 任务队列
  uploadQueue = [],
  options = {
    method: "POST",
    hostname: "tinypng.com",
    path: "/web/shrink",
    headers: {
      rejectUnauthorized: true,
      "Postman-Token": Date.now(),
      "Cache-Control": "no-cache",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36",
    },
  }
/**
 * 延时函数
 * @param {number} time 单位毫秒
 */
const sleep = time => new Promise(ok => setTimeout(ok, time))

function checkPath(path) {
  const outputPath = path.replace(root, output)
  if (fs.existsSync(outputPath)) return
  try {
    fs.mkdirSync(outputPath, { recursive: true })
  } catch (error) {
    console.error('路径创建失败', error)
  }
}
/**
 * 加载文件夹,生成压缩队列
 * @param {string} folder 文件夹路径
 */
function loadFolder(folder) {
  const list = fs.readdirSync(folder)
  list.forEach(item => {
    if (item !== ".DS_Store") fileFilter(Path.join(folder, item))
  })
}
/**
 * 处理路径,符合规则的文件加入队列,文件夹递归,不符合的文件直接复制到输出目录
 * @param {string} path
 */
function fileFilter(path) {
  const stats = fs.statSync(path)
  if (stats.isFile()) {
    // 是文件
    if (stats.size <= max
      && exts.includes(Path.extname(path))
    ) return uploadQueue.push(path)
    checkPath(Path.dirname(path))
    fs.copyFile(path, path.replace(root, output))
  } else {
    // 文件夹递归
    checkPath(path)
    loadFolder(path)
  }
}

const compressStart = async queue => {
  for await (const filePath of queue) {
    const res = await fileUpload(filePath)
    if (!res) return
    // 上传间隔,一般不用开
    // await sleep(500)
    // 异步下载
    downloadFile(res, filePath)
  }
}

//
/**
 *  出错信息可能为{"error":"Bad request","message":"Request is invalid"}
 * @param {string} filePath
 * @returns {Object} 包含上传和下载信息的对象
 */
function fileUpload(filePath) {
  const info = `${++current}/${uploadQueue.length} [${Path.basename(filePath)}]`
  console.log(`开始上传 ${info}`)
  return new Promise((resolve, reject) => {
    const _opt = {...options}
    _opt.headers['X-Forwarded-For'] = Array.from('1111').map(() => ~~(Math.random() * 255)).join('.')
    const req = https.request(options, function (res) {
      res.on("data", buf => {
        let res = JSON.parse(buf.toString())
        if (res.error) return (console.error(`${info}：压缩失败！报错：${res.message}`), reject())
        return resolve({ res, info })
      })
    })
    // 读取文件上传
    req.write(fs.readFileSync(filePath), "binary")
    req.on("error", e => (console.error(`${info} 上传失败`, e), reject()))
    req.end()
  })
}
/**
 * 下载压缩好的图片
 * @param {Res} compressFile { 
 * input: { size: 887, type: "image/png" }, 
 * output: { size: 785, type: "image/png", width: 81, height: 81, ratio: 0.885, url: "https://tinypng.com/web/output/xxx" } 
 * }
 * @param {any} info 说明文字,log用
 * @param {any} filePath 要写入的文件路径
 */
function downloadFile({ res: compressFile, info }, filePath) {
  const url = new URL(compressFile.output.url)
  const req = https.request(url, res => {
    let body = ""
    res.setEncoding("binary")
    res.on("data", (data) => { body += data })
    res.on("end", () => {
      try {
        // 下载完毕写入本地
        fs.writeFileSync(filePath.replace(root, output), body, { encoding: "binary" })
        console.log(
          `${info} 压缩成功 \n原始大小: ${compressFile.input.size}，压缩大小: ${compressFile.output.size}，优化比例 ${compressFile.output.ratio}`
        )
      } catch (err) {
        console.error(`${info} 写入文件失败`, err)
      }
    })
  })
  req.on("error", e => console.error(`${info} 下载出错`, e))
  req.end()
}

// RUA!!
loadFolder(root)
console.log('压缩队列', uploadQueue.reduce((str, fileName) => { return `${str}\n${fileName}` }, ''))
compressStart(uploadQueue)
