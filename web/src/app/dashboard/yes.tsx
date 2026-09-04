import { Badge } from '@aether-zone/kosmos';

/**
 * The yes/no cell shared by the clients, users and tokens tables. Each of them
 * carried an identical local copy before kosmos supplied the badge underneath.
 */
export function Yes({ value }: { value: boolean }) {
  return (
    <Badge variant={value ? 'success' : 'secondary'} size="sm">
      {value ? 'yes' : 'no'}
    </Badge>
  );
}
