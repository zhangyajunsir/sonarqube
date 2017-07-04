/*
 * SonarQube
 * Copyright (C) 2009-2017 SonarSource SA
 * mailto:info AT sonarsource DOT com
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */
package org.sonar.db.es;

public final class EsQueueDto {

  public enum Type {
    USER, RULE, RULE_EXTENSION
  }

  private String uuid;
  private Type docType;
  private String docId;

  public String getUuid() {
    return uuid;
  }

  EsQueueDto setUuid(String uuid) {
    this.uuid = uuid;
    return this;
  }

  public Type getDocType() {
    return docType;
  }

  private EsQueueDto setDocType(Type t) {
    this.docType = t;
    return this;
  }

  public String getDocId() {
    return docId;
  }

  private EsQueueDto setDocId(String s) {
    this.docId = s;
    return this;
  }

  @Override
  public String toString() {
    StringBuilder sb = new StringBuilder("EsQueueDto{");
    sb.append("uuid='").append(uuid).append('\'');
    sb.append(", docType=").append(docType);
    sb.append(", docId='").append(docId).append('\'');
    sb.append('}');
    return sb.toString();
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) {
      return true;
    }
    if (!(o instanceof EsQueueDto)) {
      return false;
    }

    EsQueueDto that = (EsQueueDto) o;

    return uuid.equals(that.uuid);
  }

  @Override
  public int hashCode() {
    return uuid.hashCode();
  }

  public static EsQueueDto create(Type docType, String docUuid) {
    return new EsQueueDto().setDocType(docType).setDocId(docUuid);
  }
}
