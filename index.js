const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');

const PORT = 3000;
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

const getLocalIp = () => {
    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {
        for (const interface of interfaces[name]) {
            if (interface.family === 'IPv4' && !interface.internal) {
                return interface.address;
            }
        }
    }

    return "localhost";
};

console.log(getLocalIp());



const sendFile = async (filePath, response, contentType) => {
    try {
        const data = await fs.readFile(filePath);
        
        response.setHeader('Content-Type', contentType);
        response.statusCode = 200;
        response.end(data);
    } catch (err) {
        response.statusCode = 404;
        response.end('Not found');
    }
};

const server = http.createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");

    // 1. Отдаем главную html-страницу
    if (request.method === 'GET' && request.url === '/') {
        await sendFile(
            path.join(__dirname, 'public', 'index.html'),
            response,
            'text/html; charset=utf-8'
        );
    }

    // 2. API получаем список файлов из папки
    else if (request.method === 'GET' && request.url === '/api/files') {
        try {
            await fs.mkdir(UPLOAD_DIR, { recursive: true });
            const files = await fs.readdir(UPLOAD_DIR);

            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify(files));
        } catch (err) {
            response.statusCode = 404;
            response.end(JSON.stringify({ error: 'Ошибка чтения папки' }));
        }
    }

    // 3. Скачивание файлов (отдача из uploads)
    else if (request.method === 'GET' && request.url.startsWith('/uploads/')) {
        const fileName = decodeURI(request.url.replace('/uploads/', ''));
        const filePath = path.join(UPLOAD_DIR, fileName);
        
        await sendFile(filePath, response, "application/octet-stream");
    }

    // 4. Загрузка файла
    else if (request.method === 'POST' && request.url === '/upload') {
        console.log('Загрузка файла...');

        const chunks = [];

        request.on('data', (chunk) => chunks.push(chunk));

        request.on('end', async () => {
            const fullBuffer = Buffer.concat(chunks);
            const contentType = request.headers['content-type'];

            if (!contentType || !contentType.includes('boundary=')) {
                response.statusCode = 400;
                return response.end('Нет boundary');
            }

            const boundary = Buffer.from(`--${contentType.split('boundary=')[1]}`);
            const doubleNewline = Buffer.from('\r\n\r\n');
            const headersEndIndex = fullBuffer.indexOf(doubleNewline);

            if (headersEndIndex === -1) return response.end('Ошибка парсинга');

            const headersSection = fullBuffer.subarray(0, headersEndIndex).toString();
            const fileNameMatch = headersSection.match(/filename="(.+?)"/);
            const originalName = path.basename(fileNameMatch[1]);
            
            const fileStart = headersEndIndex + 4;
            const fileEnd = fullBuffer.indexOf(boundary, fileStart);
            const fileData = fullBuffer.subarray(fileStart, fileEnd - 2);

            try {
                await fs.mkdir(UPLOAD_DIR, { recursive: true });
                await fs.writeFile(path.join(UPLOAD_DIR, originalName), fileData);
                
                response.statusCode = 200;
                response.end('Сохранено');
            } catch (err) {
                console.error(err);
                response.statusCode = 500;
                response.end('Ошибка сохранения');
            }
        })
    }

    // 5. Удаление файла
    else if (request.method === 'DELETE' && request.url.startsWith('/api/files/')) {
        const safeFileName = decodeURIComponent(path.basename(request.url));
        const filePath = path.join(UPLOAD_DIR, safeFileName);

        try {
            await fs.unlink(filePath);
            
            response.statusCode = 200;
            response.end('Файл удален');
        } catch (err) {
            console.error(err);
            
            response.statusCode = 404;
            response.end("Ошибка удаления файла");
        }
    } else {
        response.statusCode = 404;
        response.end('Ничего не найдено');
    }
});

server.listen(PORT, '0.0.0.0');
console.log(`Сервер был запущен по адресу - http://${getLocalIp()}:${PORT}`);