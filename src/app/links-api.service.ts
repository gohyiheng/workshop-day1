import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface Link {
  code: string;
  url: string;
  shortUrl: string;
  hits: number;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class LinksApiService {
  private readonly http = inject(HttpClient);
  private readonly linksUrl = '/api/links';

  getLinks(): Observable<Link[]> {
    return this.http.get<Link[]>(this.linksUrl);
  }

  createLink(url: string): Observable<Link> {
    return this.http.post<Link>(this.linksUrl, { url });
  }
}
