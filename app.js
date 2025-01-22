const express = require('express');
const multer = require('multer');
const path = require('path');
const { Pool } = require('pg');
const app = express();
const port = 3005;

// Konfigurasi penyimpanan gambar menggunakan multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, 'uploads/'));  // Folder uploads untuk menyimpan file
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));  // Nama file unik
    }
});
const upload = multer({ storage: storage });

// Koneksi ke database PostgreSQL dengan PostGIS
const pool = new Pool({
    user: 'ag2417_24_g5',
    host: '18.191.141.146',
    database: 'ag2417_24',
    password: '@Whomam_Japan09', // Ganti dengan password PostgreSQL Anda
    port: 5432,  // Port PostgreSQL default
});

// Tes koneksi ke PostgreSQL
pool.connect((err, client, release) => {
    if (err) {
        return console.error('Error connecting to PostgreSQL:', err.stack);
    }
    console.log('PostgreSQL connected!');
    release(); // Release koneksi setelah terhubung
});

// Middleware untuk menerima data JSON dan form-urlencoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Melayani file statis dari folder webgis
app.use(express.static(path.join(__dirname)));  // Melayani semua file dari folder 'webgis'
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));  // Melayani file gambar dari folder uploads

// Route untuk menampilkan form_pengaduan.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'form_pengaduan.html'));  // Mengirim file HTML dari folder webgis
});

// Route untuk menyimpan pengaduan dengan kecamatan yang dihitung menggunakan PostGIS
app.post('/submit_pengaduan', upload.single('photo'), async (req, res) => {
    try {
        console.log('Received data:', req.body);
        console.log('Uploaded file name:', req.file ? req.file.filename : 'No file uploaded');

        const { name, category, subcategory, description, latitude, longitude, priority } = req.body;
        const photo_path = req.file ? `/uploads/${req.file.filename}` : null;

        const parsedLatitude = parseFloat(latitude);
        const parsedLongitude = parseFloat(longitude);

        console.log('Parsed Latitude:', parsedLatitude);
        console.log('Parsed Longitude:', parsedLongitude);

        if (isNaN(parsedLatitude) || isNaN(parsedLongitude)) {
            console.log('Invalid latitude or longitude.');
            return res.status(400).json({ error: 'Invalid coordinate data' });
        }

        // Find the kommun (district) based on coordinates
        const kecamatanQuery = `
            SELECT kecamatan FROM ag2417_24_g5_schema.kecamatan_table
            WHERE ST_Within(ST_SetSRID(ST_MakePoint($1, $2), 4326), geom)
        `;
        const kecamatanResult = await pool.query(kecamatanQuery, [parsedLongitude, parsedLatitude]);

        console.log('Kecamatan query result:', kecamatanResult.rows);

        if (kecamatanResult.rows.length > 0) {
            const kecamatan = kecamatanResult.rows[0].kecamatan;
            console.log('Found kecamatan:', kecamatan);

            // Create geometry for the location
            const lokasi = `ST_SetSRID(ST_MakePoint(${parsedLongitude}, ${parsedLatitude}), 4326)`;

            // Insert the complaint into the database
            const insertQuery = `
                INSERT INTO ag2417_24_g5_schema.pengaduan (name, category, subcategory, description, location, photo_path, priority, kecamatan)
                VALUES ($1, $2, $3, $4, ${lokasi}, $5, $6, $7) RETURNING id
            `;
            const result = await pool.query(insertQuery, [
                name, category, subcategory, description, photo_path, priority, kecamatan
            ]);

            console.log('Data saved with ID:', result.rows[0].id);

            // Send success message
            res.status(200).json({ message: 'Your complaint has been successfully submitted and will be processed shortly.' });
        } else {
            console.log('No kecamatan found for the given coordinates.');
            res.status(404).json({ error: 'No kecamatan found for this location.' });
        }

    } catch (err) {
        console.error('Error saving complaint:', err);
        res.status(500).json({ error: `An error occurred while saving the complaint: ${err.message}` });
    }
});

app.get('/get_laporan_by_kecamatan', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT kecamatan, 
                SUM(CASE WHEN priority = 'High' THEN 1 ELSE 0 END) AS high_priority_reports,
                SUM(CASE WHEN priority  = 'Medium' THEN 1 ELSE 0 END) AS medium_priority_reports,
                SUM(CASE WHEN priority  = 'Low' THEN 1 ELSE 0 END) AS low_priority_reports
            FROM ag2417_24_g5_schema.pengaduan
            GROUP BY kecamatan
        `);

app.get('/api/get_all_reports', async (req, res) => {
    try {
        // Dapatkan query parameter dari URL (misalnya: /api/get_all_reports?priority=High&category=infrastructure)
        const { priority, category, subcategory, kecamatan } = req.query;

        // Buat query dasar
        let query = `
            SELECT id, name, category, subcategory, description, priority, kecamatan, 
                   ST_X(location::geometry) AS longitude, ST_Y(location::geometry) AS latitude
            FROM ag2417_24_g5_schema.pengaduan
            WHERE 1=1
        `;

        // Menambahkan filter ke query jika parameter ada
        const values = [];
        if (priority) {
            query += ` AND priority = $${values.length + 1}`;
            values.push(priority);
        }
        if (category) {
            query += ` AND category = $${values.length + 1}`;
            values.push(category);
        }
        if (subcategory) {
            query += ` AND subcategory = $${values.length + 1}`;
            values.push(subcategory);
        }
        if (kecamatan) {
            query += ` AND kecamatan = $${values.length + 1}`;
            values.push(kecamatan);
        }

        // Eksekusi query dengan parameter yang diterima
        const result = await pool.query(query, values);
        res.status(200).json(result.rows); // Kirim hasil query sebagai JSON
    } catch (err) {
        console.error('Error fetching filtered reports:', err);
        res.status(500).json({ error: 'An error occurred while fetching reports' });
    }
});



        // Rename field 'kecamatan' to 'kommun' in the response
        const renamedResult = result.rows.map(row => ({
            kommun: row.kecamatan,
            high_priority_reports: row.high_priority_reports,
            medium_priority_reports: row.medium_priority_reports,
            low_priority_reports: row.low_priority_reports
        }));

        res.status(200).json(renamedResult);
    } catch (err) {
        console.error('Error fetching laporan:', err);
        res.status(500).json({ error: 'An error occurred while fetching the report' });
    }
});



// Route untuk mengambil data satu meter run-up tsunami
app.get('/api/satumeter', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', jsonb_agg(jsonb_build_object(
                    'type', 'Feature',
                    'geometry', ST_AsGeoJSON(geom)::jsonb,
                    'properties', jsonb_build_object(
                        'height', '1 meter'
                    )
                ))
            ) AS geojson
            FROM ag2417_24_g5_schema.satumeter;
        `);
        res.status(200).json(result.rows[0].geojson);
    } catch (err) {
        console.error('Error saat mengambil data GeoJSON satumeter:', err);
        res.status(500).json({ error: 'Terjadi kesalahan saat mengambil data satumeter' });
    }
});

// Route untuk mengambil data dua meter run-up tsunami
app.get('/api/duameter', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', jsonb_agg(jsonb_build_object(
                    'type', 'Feature',
                    'geometry', ST_AsGeoJSON(geom)::jsonb,
                    'properties', jsonb_build_object(
                        'height', '2 meter'
                    )
                ))
            ) AS geojson
            FROM ag2417_24_g5_schema.duameter;
        `);
        res.status(200).header('Content-Type', 'application/json').json(result.rows[0].geojson);
    } catch (err) {
        console.error('Error saat mengambil data GeoJSON duameter:', err);
        res.status(500).json({ error: 'Terjadi kesalahan saat mengambil data duameter' });
    }
});

// Route untuk mengambil data lima meter run-up tsunami
app.get('/api/limameter', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', jsonb_agg(jsonb_build_object(
                    'type', 'Feature',
                    'geometry', ST_AsGeoJSON(geom)::jsonb,
                    'properties', jsonb_build_object(
                        'height', '5 meter'
                    )
                ))
            ) AS geojson
            FROM ag2417_24_g5_schema.limameter;
        `);
        res.status(200).json(result.rows[0].geojson);
    } catch (err) {
        console.error('Error saat mengambil data GeoJSON limameter:', err);
        res.status(500).json({ error: 'Terjadi kesalahan saat mengambil data limameter' });
    }
});

// Route untuk mengambil data lima belas meter run-up tsunami
app.get('/api/limabelasmeter', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', jsonb_agg(jsonb_build_object(
                    'type', 'Feature',
                    'geometry', ST_AsGeoJSON(geom)::jsonb,
                    'properties', jsonb_build_object(
                        'height', '15 meter'
                    )
                ))
            ) AS geojson
            FROM ag2417_24_g5_schema.limabelasmeter;
        `);
        res.status(200).json(result.rows[0].geojson);
    } catch (err) {
        console.error('Error saat mengambil data GeoJSON limabelasmeter:', err);
        res.status(500).json({ error: 'Terjadi kesalahan saat mengambil data limabelasmeter' });
    }
});

// Route untuk mengambil data tiga puluh meter run-up tsunami
app.get('/api/tigapuluhmeter', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', jsonb_agg(jsonb_build_object(
                    'type', 'Feature',
                    'geometry', ST_AsGeoJSON(geom)::jsonb,
                    'properties', jsonb_build_object(
                        'height', '30 meter'
                    )
                ))
            ) AS geojson
            FROM ag2417_24_g5_schema.tigapuluhmeter;
        `);
        res.status(200).json(result.rows[0].geojson);
    } catch (err) {
        console.error('Error saat mengambil data GeoJSON tigapuluhmeter:', err);
        res.status(500).json({ error: 'Terjadi kesalahan saat mengambil data tigapuluhmeter' });
    }
});

// Route untuk mengambil data enam puluh meter run-up tsunami
app.get('/api/enampuluhmeter', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', jsonb_agg(jsonb_build_object(
                    'type', 'Feature',
                    'geometry', ST_AsGeoJSON(geom)::jsonb,
                    'properties', jsonb_build_object(
                        'height', '60 meter'
                    )
                ))
            ) AS geojson
            FROM ag2417_24_g5_schema.enampuluhmeter;
        `);
        res.status(200).json(result.rows[0].geojson);
    } catch (err) {
        console.error('Error saat mengambil data GeoJSON enampuluhmeter:', err);
        res.status(500).json({ error: 'Terjadi kesalahan saat mengambil data enampuluhmeter' });
    }
});

app.get('/api/kecamatan', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', jsonb_agg(jsonb_build_object(
                    'type', 'Feature',
                    'geometry', ST_AsGeoJSON(geom)::jsonb,
                    'properties', jsonb_build_object(
                        'nama_kecamatan', kecamatan
                    )
                ))
            ) AS geojson
            FROM ag2417_24_g5_schema.kecamatan_table;
        `);
        res.status(200).json(result.rows[0].geojson);
    } catch (err) {
        console.error('Error saat mengambil data GeoJSON kecamatan:', err);
        res.status(500).json({ error: 'Terjadi kesalahan saat mengambil data kecamatan' });
    }
});

app.get('/api/luas_terdampak/:height', async (req, res) => {
    const height = req.params.height;  // Ambil parameter ketinggian run-up dari URL

    let tableName;
    switch (height) {
        case '1':
            tableName = 'ag2417_24_g5_schema.edit_satumeter';  // Tabel run-up 1 meter
            break;
        case '2':
            tableName = 'ag2417_24_g5_schema.edit_duameter';  // Tabel run-up 2 meter
            break;
        case '5':
            tableName = 'ag2417_24_g5_schema.edit_limameter';  // Tabel run-up 5 meter
            break;
        case '15':
            tableName = 'ag2417_24_g5_schema.edit_limabelasmeter';  // Tabel run-up 15 meter
            break;
        case '30':
            tableName = 'ag2417_24_g5_schema.edit_tigapuluhmeter';  // Tabel run-up 30 meter
            break;
        case '60':
            tableName = 'ag2417_24_g5_schema.edit_enampuluhmeter';  // Tabel run-up 60 meter
            break;
        default:
            return res.status(400).json({ error: 'Invalid height parameter' });
    }

    try {
        // Query untuk menghitung luas terdampak per kecamatan
        const kecamatanQuery = `
            SELECT 
                ag2417_24_g5_schema.edit_kecamatan.kecamatan, 
                ROUND(SUM(ST_Area(ST_Intersection(ag2417_24_g5_schema.edit_kecamatan.wkb_geometry, ${tableName}.wkb_geometry))::NUMERIC), 2) AS luas_terdampak
            FROM 
                ag2417_24_g5_schema.edit_kecamatan
            JOIN 
                ${tableName} ON ST_Intersects(ag2417_24_g5_schema.edit_kecamatan.wkb_geometry, ${tableName}.wkb_geometry)
            GROUP BY 
                ag2417_24_g5_schema.edit_kecamatan.kecamatan;
        `;

        // Query untuk menghitung luas terdampak per penggunaan lahan
        const gunaLahanQuery = `
            SELECT 
                COALESCE(ag2417_24_g5_schema.edit_pl.gunalahan, 'Tidak Diketahui') AS gunalahan, 
                ROUND(SUM(ST_Area(ST_Intersection(ag2417_24_g5_schema.edit_pl.wkb_geometry, ${tableName}.wkb_geometry))::NUMERIC), 2) AS luas_terdampak
            FROM 
                ag2417_24_g5_schema.edit_pl
            JOIN 
                 ${tableName} ON ST_Intersects(ag2417_24_g5_schema.edit_pl.wkb_geometry, ${tableName}.wkb_geometry)
            GROUP BY 
                ag2417_24_g5_schema.edit_pl.gunalahan;
        `;

        // Jalankan kedua query secara paralel
        const [kecamatanResult, gunaLahanResult] = await Promise.all([
            pool.query(kecamatanQuery),
            pool.query(gunaLahanQuery)
        ]);

        // Kirimkan kedua hasil dalam satu respons JSON
        res.status(200).json({
            kecamatan: kecamatanResult.rows,
            gunaLahan: gunaLahanResult.rows
        });

    } catch (err) {
        console.error('Error saat menghitung luas terdampak:', err.message);
        res.status(500).json({ error: 'Terjadi kesalahan saat menghitung luas terdampak: ' + err.message });
    }
});


            
// Jalankan server pada port 3005
app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
});
