import { NextResponse } from 'next/server';
import { verifyIdpJwt, createSession } from '@/lib/auth';
import db from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return new NextResponse('JWT Token fehlt.', { status: 400 });
  }

  // JWT verifizieren
  const decoded = verifyIdpJwt(token);
  if (!decoded || !decoded.email) {
    return new NextResponse('Ungültiger oder abgelaufener JWT Token.', { status: 400 });
  }

  const email = decoded.email;
  const rawDisplayName = decoded.display_name || decoded.displayName || decoded.displayname || decoded.name || decoded.username || null;
  const displayName = rawDisplayName ? String(rawDisplayName).trim() : null;
  
  try {
    // Benutzer in der Datenbank suchen (Case-Insensitive)
    let user = db.prepare('SELECT id, email, role, name FROM users WHERE LOWER(email) = LOWER(?)').get(email);
    
    if (!user) {
      // Wenn der Benutzer noch nicht existiert, legen wir ihn an.
      // Rolle aus dem Token bestimmen (falls angegeben), andernfalls standardmäßig 'customer'
      let role = decoded.role;
      if (!role || !['customer', 'agent', 'admin'].includes(role)) {
        role = 'customer';
      }
      
      const userId = decoded.id || `usr-${Math.floor(100000 + Math.random() * 900000)}`;
      db.prepare('INSERT INTO users (id, email, role, name) VALUES (?, ?, ?, ?)').run(userId, email, role, displayName);
      user = { id: userId, email, role, name: displayName };
    } else {
      // Falls der Benutzer existiert, stellen wir sicher, dass sein Name mit display_name aktualisiert wird
      if (displayName && user.name !== displayName) {
        db.prepare('UPDATE users SET name = ? WHERE id = ?').run(displayName, user.id);
        user.name = displayName;
      }
    }

    // Interne Session erstellen
    await createSession(user);

    // Weiterleiten basierend auf der Rolle
    const host = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    if (user.role === 'admin') {
      return NextResponse.redirect(`${host}/admin`);
    } else if (user.role === 'agent') {
      return NextResponse.redirect(`${host}/agent`);
    } else {
      return NextResponse.redirect(`${host}/`);
    }
  } catch (err) {
    console.error('Fehler beim IdP-Callback:', err);
    return new NextResponse('Interner Fehler bei der IdP-Verarbeitung.', { status: 500 });
  }
}
