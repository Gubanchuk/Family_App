import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AvatarFace from './AvatarFace';
import { setAvatarSigner } from './avatarUrls';

describe('AvatarFace', () => {
  it('shows the letter without a photo', () => {
    render(<span className="av"><AvatarFace member={{ name: 'Оля', avatar_path: null }} /></span>);
    expect(screen.getByText('О')).toBeInTheDocument();
  });

  it('shows the photo, and the letter again when the photo fails to load', async () => {
    localStorage.clear();
    setAvatarSigner(async (paths) => new Map(paths.map((p) => [p, `https://cdn/${p}`])));
    const { container } = render(<span className="av"><AvatarFace member={{ name: 'Оля', avatar_path: 'h/avatars/m/1.jpg' }} /></span>);
    const img = await screen.findByRole('presentation');
    expect(img).toHaveAttribute('src', 'https://cdn/h/avatars/m/1.jpg');
    fireEvent.error(img);
    expect(container).toHaveTextContent('О');
  });
});
