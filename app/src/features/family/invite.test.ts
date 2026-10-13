import { describe, expect, it } from 'vitest';
import { familyErrorText, inviteUrl, readInviteCode } from './invite';

describe('invite links', () => {
  it('builds a link a parent can send', () => {
    expect(inviteUrl('https://family.example', 'ABCD234XYZ')).toBe('https://family.example/join?code=ABCD234XYZ');
  });
  it('reads the code from the link, forgiving case and spaces', () => {
    expect(readInviteCode('?code=%20abcd234xyz%20')).toBe('ABCD234XYZ');
    expect(readInviteCode('?code=')).toBeNull();
    expect(readInviteCode('')).toBeNull();
  });
  it('explains database errors in Russian', () => {
    expect(familyErrorText('invite_used')).toBe('Это приглашение уже использовали. Попросите родителя прислать новое.');
    expect(familyErrorText('invite_expired')).toBe('Приглашение устарело: оно действует 7 дней. Попросите новое.');
    expect(familyErrorText('invite_not_found')).toBe('Такого приглашения нет. Проверьте ссылку.');
    expect(familyErrorText('already_in_family')).toBe('Вы уже в семье. Второй раз вступать не нужно.');
    expect(familyErrorText('not_a_parent')).toBe('Это могут сделать только родители.');
    expect(familyErrorText('boom')).toBe('Не получилось. Попробуйте ещё раз.');
  });
});
