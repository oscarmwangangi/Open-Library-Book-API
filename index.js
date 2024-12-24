import express from "express";  // Import express
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import fetch from 'node-fetch'; // Add this to fetch data from external APIs
import fs from 'fs';
import pkg from 'pg';
const { Pool } = pkg;

const app = express();  // Create an instance of express
const port = 3000;  // Define the port number

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



app.use(cors());
app.use(express.json());

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'open_library',
    password: 'oscar',
    port: 5432,
});

// Set EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views');  // Folder for EJS templates


// Define a route for the root URL ('/')
app.get('/', (req, res) => {
  res.render('index');
});

app.get('/book/:bookId', (req, res) => {
    const bookId = req.params.bookId;
    const bookPath = path.join(__dirname, 'books', `${bookId}.pdf`); // Assuming PDF format

    if (fs.existsSync(bookPath)) {
        res.sendFile(bookPath);
    } else {
        res.status(404).send('Book not found');
    }
});


app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    try {
        const response = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        const books = data.docs.slice(0, 10).map(book => {
            // Construct the book cover URL if cover_i is available
            const coverImageUrl = book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg` : null;
            return { ...book, coverImageUrl };
        });
        res.json(books); // Return top 10 results with cover image URL
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch data from Open Library API' });
    }
});


// Save a book fetched from Open Library to the database
app.post('/books', async (req, res) => {
    const { title, author, year, rating, status } = req.body;

    try {
        const result = await pool.query(
            'INSERT INTO books (title, author, year, rating, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [title, author, year, rating, status]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to save book' });
    }
});

// Get all saved books
app.get('/books', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM books ORDER BY id');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch books' });
    }
});
// Get book details for editing
app.get('/edit/:id', async (req, res) => {
    const { id } = req.params; // Get the book ID from the URL parameter

    try {
        const result = await pool.query('SELECT * FROM books WHERE id = $1', [id]);
        
        if (result.rowCount > 0) {
            res.json(result.rows[0]); // Send the book details as a response
        } else {
            res.status(404).json({ error: 'Book not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch book details' });
    }
});
app.put('/edit/:id', async (req, res) => {
    const { id } = req.params;
    const { title, author, year, rating, status } = req.body;

    // Provide default values if any fields are missing
    const updatedTitle = title || 'Untitled';
    const updatedAuthor = author || 'Unknown';
    const updatedYear = year || 0;
    const updatedRating = rating || null;
    const updatedStatus = status || 'Unread';

    try {
        // Check if the book exists
        const bookResult = await pool.query('SELECT * FROM books WHERE id = $1', [id]);

        if (bookResult.rowCount === 0) {
            return res.status(404).json({ error: 'Book not found' });
        }

        // Update the book's details in the database
        const updateQuery = `
            UPDATE books
            SET title = $1, author = $2, year = $3, rating = $4, status = $5
            WHERE id = $6 RETURNING *;
        `;
        const result = await pool.query(updateQuery, [updatedTitle, updatedAuthor, updatedYear, updatedRating, updatedStatus, id]);

        if (result.rowCount > 0) {
            res.json({ message: 'Book updated successfully', book: result.rows[0] });
        } else {
            res.status(400).json({ error: 'Failed to update book' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update book' });
    }
});


// Get all saved books
app.delete('/delete/:id', async (req, res) => {
    const { id } = req.params; // Get the book ID from the route parameter
    try {
        // Query to delete the book by ID
        const result = await pool.query('DELETE FROM books WHERE id = $1 RETURNING *', [id]);
        
        if (result.rowCount > 0) {
            res.json({ message: 'Book deleted successfully' });
        } else {
            res.status(404).json({ error: 'Book not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete book' });
    }
});

// Start the server
app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
